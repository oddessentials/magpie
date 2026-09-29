import argparse
import json
from pathlib import Path
import subprocess

EXPECTED_POIS = {
    '11111111222222223333333344444444': ['55555555666666667777777788888888', '123456789ABCDEF013579BDF2468ACE0'],
    '00000001000000020000000300000004': ['00000005000000060000000700000008'],
}
EXPECTED_VALUES = {'Location.Region.Brynmoor': 7.25, 'Location.Region.Fellhollow': -2.5}


def check(session, decoded):
    session = Path(session)
    manifest = json.loads((session / 'recording.json').read_text(encoding='utf-8'))
    if manifest.get('phase') != 'finished' or not manifest.get('graceful_save_verified') or not manifest.get('capture_verified'):
        raise ValueError('capture and save-and-quit must pass before validating save fields')
    lines = (session / 'magpie-probe.txt').read_text(encoding='utf-8').splitlines()
    if any(' ERROR ' in line for line in lines) or not all(marker in lines for marker in ('clock PASS', 'progress PASS', 'poi PASS', 'SAVE_FIELDS_DONE')):
        raise ValueError('engine field probe did not pass all checks')
    if decoded.get('clock_seconds') != 1800:
        raise ValueError('saved clock differs from the engine-set time')
    discoveries = decoded.get('discoveries') or []
    actual = {entry['character_guid']: entry['pois'] for entry in discoveries}
    if actual != EXPECTED_POIS or len(discoveries) != len(EXPECTED_POIS):
        raise ValueError('saved POIs differ from the synthetic engine inputs')
    progress = decoded.get('progress') or {}
    if sorted(progress.get('defeated_bosses') or []) != ['GeneralVelgar', 'MagpieFixtureBoss']:
        raise ValueError('saved bosses differ from the synthetic engine inputs')
    values = progress.get('values') or []
    if {entry['tag']: entry['value'] for entry in values} != EXPECTED_VALUES or len(values) != len(EXPECTED_VALUES):
        raise ValueError('saved tagged progress differs from the synthetic engine inputs')
    return dict(server_build=manifest['server_build'], version=manifest.get('game_version'), clock_seconds=1800, characters=len(actual), pois=sum(len(pois) for pois in actual.values()), bosses=2, tagged_values=2)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('session', type=Path)
    parser.add_argument('--reader', required=True, type=Path)
    parser.add_argument('--save', default='magpie-rig.sav')
    args = parser.parse_args()
    folder = (args.session / 'Saved/SaveGames').resolve()
    save = (folder / args.save).resolve()
    if save.parent != folder:
        parser.error('--save must name a file in the recorded SaveGames directory')
    result = subprocess.run([str(args.reader.resolve()), 'read', str(save)], check=True, capture_output=True, text=True, encoding='utf-8', creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    print(json.dumps(check(args.session, json.loads(result.stdout)), indent=2))


if __name__ == '__main__':
    main()
