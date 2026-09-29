import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/gamefacts'))
from usmap import Mappings


def extract(session):
    manifest = json.loads((session / 'recording.json').read_text(encoding='utf-8'))
    if manifest.get('phase') != 'finished' or not manifest.get('capture_verified') or not manifest.get('graceful_save_verified') or manifest.get('exit_code') != 0:
        raise ValueError('schema capture must finish with verified hooks and save-and-quit')
    source = (ROOT / 'mod/MagpieEvents/Scripts/main.lua').read_bytes()
    if hashlib.sha256(source).hexdigest() != manifest['mod_sha256']:
        raise ValueError('mod differs from the schema capture')
    build = json.loads((ROOT / 'web/src/lib/world/build.json').read_text())
    if (manifest['server_build'], manifest['game_version']) != (build['server_build'], build['version']):
        raise ValueError('schema capture differs from the verified facts build')
    mapping_path = ROOT / 'tools/rig/mappings' / build['mappings']
    mappings = Mappings(mapping_path.read_bytes())
    lines = (session / 'magpie-probe.txt').read_text(encoding='utf-8').splitlines()
    if 'SCHEMA_PASS' not in lines or any(line.startswith(('SCHEMA_ERROR', 'CALLBACKS_ERROR')) for line in lines):
        raise ValueError('schema probe did not complete')
    functions, structs, enums = {}, {}, {}
    for line in lines:
        title, *entries = line.split('\t')
        if title.startswith('Enum '):
            enums[title[5:]] = {name: int(value) for name, value in (entry.rsplit('=', 1) for entry in entries if entry)}
        elif title.startswith(('Function ', 'ScriptStruct ')):
            kind, path = title.split(' ', 1)
            fields = []
            for entry in entries:
                if not entry:
                    continue
                name, field_kind, extra = entry.split(':', 2)
                fields.append(dict(name=name, kind=field_kind, struct=extra.removeprefix('ScriptStruct ') or None))
            (functions if kind == 'Function' else structs)[path] = fields
    hooks = {}
    needed = set()
    for path, kind in re.findall(r'hook\("([^"]+)", "([^"]+)"', source.decode()):
        fields = functions[path]
        hooks[path] = dict(kind=kind, fields=fields)
        needed.update(field['struct'] for field in fields if field['struct'])
    result = {}
    while needed:
        path = needed.pop()
        if path in result:
            continue
        fields = structs[path]
        parent = mappings.structs[path.rsplit('.', 1)[-1]][0]
        if parent:
            matches = [key for key in structs if key.rsplit('.', 1)[-1] == parent]
            if len(matches) != 1:
                raise ValueError('ambiguous struct parent')
            parent = matches[0]
            needed.add(parent)
        result[path] = dict(fields=fields, parent=parent)
        needed.update(field['struct'] for field in fields if field['struct'])
    return dict(source=dict(server_build=manifest['server_build'], version=manifest['game_version'], mod_sha256=manifest['mod_sha256'], mappings_sha256=hashlib.sha256(mapping_path.read_bytes()).hexdigest(), method='read-only engine reflection and verified USMAP inheritance'), hooks=hooks, structs=result, enums={key: enums[key] for key in ('/Script/Dominion.EQuestState', '/Script/Dominion.ECraftingResult', '/Script/Dominion.EDamageClass')})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = extract(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print('Verified %d hooks and %d structs' % (len(result['hooks']), len(result['structs'])))


if __name__ == '__main__':
    main()
