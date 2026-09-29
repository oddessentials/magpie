import json
from pathlib import Path

from lupa.lua54 import LuaRuntime

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / 'tools/rig/testdata/hook-schema-25501739.json'
SCRIPT = ROOT / 'mod/MagpieEvents/Scripts/main.lua'


class Name:
    def __init__(self, value):
        self.value = value

    def ToString(self):
        return self.value


class Object:
    def __init__(self, name='', fields=None, valid=True):
        self.name = name
        self.fields = fields or {}
        self.valid = valid

    def __getattr__(self, key):
        if key.startswith('__'):
            raise AttributeError(key)
        return self.fields.get(key)

    def IsValid(self):
        return self.valid

    def GetFullName(self):
        return self.name

    def GetFName(self):
        return Name(self.name.rsplit('.', 1)[-1])

    def GetOwner(self):
        return self.fields.get('owner')

    def GetOuter(self):
        return self.fields.get('outer')

    def GetPlayerName(self):
        return self.fields.get('player_name')


class Property:
    def __init__(self, field):
        self.field = field

    def GetFName(self):
        return Name(self.field['name'])

    def GetClass(self):
        return Object(self.field['kind'])


class Descriptor(Object):
    def __init__(self, path, fields, lookup, parent=None):
        super().__init__(path)
        self.properties = fields
        self.lookup = lookup
        self.parent = parent

    def ForEachProperty(self, callback):
        for field in self.properties:
            if callback(Property(field)):
                break

    def GetSuperStruct(self):
        return self.lookup(self.parent)


class Param:
    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value


class Harness:
    def __init__(self, folder, script=SCRIPT):
        self.schema = json.loads(SCHEMA.read_text(encoding='utf-8'))
        self.lua = LuaRuntime(unpack_returned_tuples=True)
        self.callbacks = {}
        self.logs = []
        self.out = Path(folder) / 'callbacks.jsonl'
        self.descriptors = {}
        for path, struct in self.schema['structs'].items():
            self.descriptors[path] = Descriptor('ScriptStruct ' + path, struct['fields'], self.lookup, struct['parent'])
        for path, hook in self.schema['hooks'].items():
            self.descriptors[path] = Descriptor('Function ' + path, hook['fields'], self.lookup)
        globals = self.lua.globals()
        globals.StaticFindObject = self.lookup
        globals.RegisterHook = self.register
        globals.print = self.logs.append
        globals.env = self.lua.table_from({'MAGPIE_EVENTS_FILE': str(self.out)})
        self.lua.execute('os.getenv = function(key) return env[key] end; os.date = function() return "2026-09-29T12:00:00Z" end')
        self.lua.execute(Path(script).read_text(encoding='utf-8'))
        state = Object('PlayerState /Game/MagpieFixture.State', dict(player_name='Magpie Fixture', PlayerId=17))
        self.context = Object('ActorComponent /Game/MagpieFixture.Component', dict(owner=Object('Actor /Game/MagpieFixture.Actor', dict(PlayerState=state))))

    def register(self, path, callback):
        if path not in self.schema['hooks']:
            raise ValueError('hook is absent from verified metadata: ' + path)
        self.callbacks[path] = callback
        return 1, 2

    def lookup(self, path):
        return self.descriptors.get(path, Object(valid=False))

    def fields(self, path):
        struct = self.schema['structs'][path]
        return (self.fields(struct['parent']) if struct['parent'] else []) + struct['fields']

    def struct(self, path, values=None, depth=0):
        values = values or {}
        fields = {field['name']: self.value(field, depth + 1) for field in self.fields(path)}
        fields.update(values)
        return Object('ScriptStruct ' + path, fields)

    def value(self, field, depth=0):
        kind = field['kind']
        if kind == 'StructProperty':
            return self.struct(field['struct'], depth=depth) if depth < 6 else Object(valid=False)
        if kind in ('StrProperty', 'NameProperty', 'TextProperty'):
            return Name('MagpieFixture') if kind != 'StrProperty' else 'Magpie fixture'
        if kind == 'BoolProperty':
            return False
        if kind in ('ObjectProperty', 'ClassProperty'):
            return Object('DataAsset /Game/MagpieFixture/Fixture.Fixture')
        if kind in ('ArrayProperty', 'SetProperty', 'MapProperty'):
            return self.lua.table_from([1, 2])
        if kind == 'EnumProperty' or any(marker in kind for marker in ('Int', 'Byte', 'Float', 'Double')):
            return 2
        return None

    def call(self, kind, values=None, context=None):
        path = next(path for path, hook in self.schema['hooks'].items() if hook['kind'] == kind)
        values = values or {}
        args = [Param(values[field['name']] if field['name'] in values else self.value(field)) for field in self.schema['hooks'][path]['fields']]
        before = len(self.records())
        self.callbacks[path](Param(context or self.context), *args)
        records = self.records()
        if len(records) != before + 1:
            raise AssertionError('callback did not emit exactly one event: ' + repr(self.logs[-1:]))
        return records[-1]

    def records(self):
        return [json.loads(line) for line in self.out.read_text(encoding='utf-8').splitlines()]
