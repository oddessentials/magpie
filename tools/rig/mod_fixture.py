import argparse
import hashlib
import json
import tempfile
from pathlib import Path

from mod_harness import Harness, Name, Object, ROOT, SCRIPT

TARGET = ROOT / 'collector/internal/collector/testdata/mod-callbacks-25501739.json'


def generate(folder):
    h = Harness(folder)
    asset = lambda name: Object('DataAsset /Game/MagpieFixture/%s.%s' % (name, name))
    vector = lambda x, y, z: h.struct('/Script/Engine.Vector_NetQuantize', dict(X=x, Y=y, Z=z))
    old = h.struct('/Script/Dominion.QuestProgress', dict(Data=asset('OldQuest'), State=1, CurrentObjective=Name('OldObjective')))
    updated = h.struct('/Script/Dominion.QuestProgress', dict(Data=asset('NewQuest'), State=2, CurrentObjective=Name('FindTheTemple')))
    damage = h.struct('/Script/Dominion.DominionDamageEvent', dict(DamageClass=1, Instigator=asset('FixtureBoar'), InstigatorLocation=vector(900, 901, 902), VictimLocation=vector(125.5, -300, 4)))
    inputs = [
        ('death', dict(DamageEvent=damage), 'player.died'),
        ('skill_level', dict(Skill=asset('UnknownSkill'), NewLevel=12), 'skill.level_up'),
        ('xp', {}, 'mod.xp'),
        ('xp_changed', dict(SkillData=asset('UnknownSkill'), CurrentXP=250, PreviousXP=175), 'player.xp'),
        ('quest', dict(OldQuest=old, UpdatedQuest=updated), 'quest.updated'),
        ('quest_complete', dict(QuestData=asset('NewQuest'), bSilent=False), 'mod.quest_complete'),
        ('build', dict(InBuildingPieceDataIndex=42, bSpawnGhost=True), 'mod.build'),
        ('build_complete', dict(InBuildingPieceDataIndex=42, bWasPReviouslyGhosted=True), 'building.placed'),
        ('craft', dict(Recipe=asset('UnknownRecipe'), Count=3, BonusCount=2), 'mod.craft'),
        ('craft_result', dict(Recipe=asset('UnknownRecipe'), Result=1, Count=3), 'mod.craft_result'),
        ('craft_result', dict(Recipe=asset('UnknownRecipe'), Result=0, Count=3), 'item.crafted'),
        ('craft_result', dict(Recipe=asset('UnknownRecipe'), Result=0, Count=0), 'mod.craft_result'),
    ]
    records = [dict(raw=h.call(kind, values), expected_type=expected) for kind, values, expected in inputs]
    return dict(source={**h.schema['source'], 'emitter_sha256': hashlib.sha256(SCRIPT.read_bytes()).hexdigest(), 'method': 'production Lua callbacks with synthetic userdata and captured engine schemas; no gameplay calls'}, records=records)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as folder:
        fixture = generate(folder)
    if args.check:
        if json.loads(TARGET.read_text(encoding='utf-8')) != fixture:
            raise SystemExit('callback fixture differs from production Lua output')
    else:
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(json.dumps(fixture, indent=2) + '\n', encoding='utf-8')
    print('Verified %d callback fixtures' % len(fixture['records']))


if __name__ == '__main__':
    main()
