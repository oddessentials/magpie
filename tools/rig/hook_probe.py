import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
KINDS = ['quest', 'xp_changed', 'build_complete', 'craft_result']


def sanitize(value):
    if isinstance(value, dict):
        return {key: sanitize(entry) for key, entry in value.items() if key not in ('self', 'ts')}
    if isinstance(value, str) and ' /Engine/Transient.' in value:
        kind = value.split(' ', 1)[0]
        if kind not in ('QuestData', 'SkillData', 'RecipeData'):
            raise ValueError('unexpected engine object in callback fixture')
        return '%s /Game/MagpieFixture/%s.%s' % (kind, kind, kind)
    return value


def check(session):
    session = Path(session)
    manifest = json.loads((session / 'recording.json').read_text(encoding='utf-8'))
    if manifest.get('phase') != 'finished' or not manifest.get('capture_verified') or not manifest.get('graceful_save_verified') or manifest.get('exit_code') != 0:
        raise ValueError('capture and save-and-quit must pass before validating callbacks')
    build = json.loads((ROOT / 'web/src/lib/world/build.json').read_text(encoding='utf-8'))
    digest = hashlib.sha256((ROOT / 'mod/MagpieEvents/Scripts/main.lua').read_bytes()).hexdigest()
    if (manifest['server_build'], manifest['game_version'], manifest['mod_sha256']) != (build['server_build'], build['version'], digest):
        raise ValueError('callback capture differs from the verified build or production mod')
    lines = (session / 'magpie-probe.txt').read_text(encoding='utf-8').splitlines()
    if not all(marker in lines for marker in ('CALLBACKS_PASS', 'SCHEMA_PASS', 'QUEST_USERDATA userdata ScriptStruct /Script/Dominion.QuestProgress')) or any(line.startswith(('CALLBACKS_ERROR', 'SCHEMA_ERROR')) or 'handler failed' in line for line in lines):
        raise ValueError('engine callback probe did not pass all checks')
    records = [json.loads(line) for line in (session / 'magpie-probe.txt.callbacks.jsonl').read_text(encoding='utf-8').splitlines()]
    records = [sanitize(record) for record in records if record.get('type') != 'mod_loaded']
    if [record['type'] for record in records] != KINDS:
        raise ValueError('engine callback sequence differs')
    quest, xp, building, craft = records
    if quest['UpdatedQuest'] != dict(Data='QuestData /Game/MagpieFixture/QuestData.QuestData', State=2, CurrentObjective='MagpieFixtureStep', QuestBools='[0]', QuestInts='[0]') or quest['bNewlyGiven'] is not False:
        raise ValueError('engine quest struct was not serialized correctly')
    if xp['SkillData'] != 'SkillData /Game/MagpieFixture/SkillData.SkillData' or (xp['CurrentXP'], xp['PreviousXP']) != (250, 175):
        raise ValueError('engine XP parameters were not serialized correctly')
    if building['InBuildingPieceDataIndex'] != 42 or building['bWasPReviouslyGhosted'] is not True:
        raise ValueError('engine building parameters were not serialized correctly')
    if craft['Recipe'] != 'RecipeData /Game/MagpieFixture/RecipeData.RecipeData' or (craft['Result'], craft['Count']) != (0, 3):
        raise ValueError('engine crafting parameters were not serialized correctly')
    return dict(source=dict(server_build=manifest['server_build'], version=manifest['game_version'], mod_sha256=digest, method='production Lua callbacks with transient engine userdata and synthetic values; no Unreal RPC bodies or player actions executed'), records=records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = check(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print('Verified %d engine callback fixtures and save-and-quit' % len(result['records']))


if __name__ == '__main__':
    main()
