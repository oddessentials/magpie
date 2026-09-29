import json
import math
from pathlib import Path

from geography import Reader, field

PACKAGE = 'RSDragonwilds/Content/Gameplay/World/Time/BP_InGameTimeActor.uasset'
CLASS = '/Game/Gameplay/World/Time/BP_InGameTimeActor.BP_InGameTimeActor_C'
EVIDENCE = Path(__file__).resolve().parents[2] / 'savereader/internal/dragonwilds/testdata/engine-save-fields-25501739.json'


def build_clock(game):
    evidence = json.loads(EVIDENCE.read_text(encoding='utf-8'))
    if (game.build, game.version) != (evidence['source']['server_build'], evidence['source']['version']):
        raise ValueError('clock semantics require engine verification for the installed build')
    pkg = game.package(PACKAGE)
    defaults = [i for i, export in enumerate(pkg.exports) if export['name'] == 'Default__BP_InGameTimeActor_C']
    if len(defaults) != 1:
        raise ValueError('missing or ambiguous game clock defaults')
    props = Reader(game).inherited(pkg, defaults[0])
    minutes = field(props, 'RealTimeMinutesPerInGameDay')
    if type(minutes) is not int or minutes <= 0 or minutes != evidence['real_minutes_per_game_day']:
        raise ValueError('clock day length differs from engine verification')
    dawn, dusk = field(props, 'TimeOfDawn'), field(props, 'TimeOfDusk')
    if any(not isinstance(hour, (int, float)) or not math.isfinite(hour) or not 0 <= hour < 24 for hour in (dawn, dusk)):
        raise ValueError('invalid clock dawn or dusk')
    return dict(source=game.source(), package=PACKAGE, actorClass=CLASS, realMinutesPerGameDay=minutes, storedTimeUnit='real_seconds', initialTicks=field(props, 'InitialTime'), dawnHour=dawn, duskHour=dusk)
