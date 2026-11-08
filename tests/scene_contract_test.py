"""Run with jsonschema==4.25.1 installed in the local .build-deps directory."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.build-deps'))
from jsonschema import Draft202012Validator


class SceneContractTest(unittest.TestCase):
    def test_example_contract_and_map_revision(self):
        schema = json.loads((ROOT / 'contracts/scene.schema.json').read_text(encoding='utf-8'))
        pack = json.loads((ROOT / 'web/scene/xuzhou-letter.json').read_text(encoding='utf-8'))
        Draft202012Validator.check_schema(schema)
        validator = Draft202012Validator(schema)
        validator.validate(pack)
        catalog = json.loads((ROOT/'web/map-compatibility.json').read_text(encoding='utf-8'))
        self.assertEqual(pack['baseMap']['revision'], catalog['canonical']['baseMapRevision'])
        actual = {'baseMapRevision':hashlib.sha256((ROOT/'web/strategic-regions.json').read_bytes()).hexdigest(),
                  'atlasRevision':hashlib.sha256((ROOT/'web/atlas.json').read_bytes()).hexdigest()}
        self.assertIn(actual, catalog['pairs'])
        invalid = copy.deepcopy(pack)
        invalid['controls'][0]['basis'] = 'planned'
        self.assertFalse(validator.is_valid(invalid), '计划不能进入当前控制记录')
        invalid = copy.deepcopy(pack)
        invalid['script'] = '任意程序'
        self.assertFalse(validator.is_valid(invalid), '剧情格式不接受可执行脚本')


if __name__ == '__main__':
    unittest.main()
