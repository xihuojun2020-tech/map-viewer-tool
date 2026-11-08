import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
import layer_publish


class LayerPublishTests(unittest.TestCase):
    def test_reviewed_copy_keeps_identity_and_publishes_final_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'web/scene').mkdir(parents=True)
            (root/'scripts').mkdir()
            for name in ['web/scene/compile.mjs', 'scripts/compile_layer.mjs']:
                (root/name).write_bytes(b'compiler')
            canonical = {'baseMapId':'jianan-219', 'baseMapRevision':'published-map', 'atlasRevision':'published-atlas', 'sceneSchemaVersion':1}
            for name in ['strategic-regions.json', 'atlas.json']:
                (root/'web'/name).write_bytes(b'{"note":"copy"}')
            actual = hashlib.sha256(b'{"note":"copy"}').hexdigest()
            catalog = {'canonical':canonical, 'pairs':[{'baseMapRevision':actual, 'atlasRevision':actual}]}
            (root/'web/map-compatibility.json').write_text(json.dumps(catalog), encoding='utf-8')
            expected = {**canonical, 'compilerVersion':hashlib.sha256(b'compilercompiler').hexdigest()}
            def compile_fake(command, **kwargs):
                pack = {'id':'story', 'version':1, 'baseMap':{'id':'jianan-219', 'revision':actual}, 'readingPositions':[]}
                Path(command[4]).write_text(json.dumps(pack), encoding='utf-8')
                return SimpleNamespace(returncode=0)
            with patch.object(layer_publish, 'PROJECT', root):
                self.assertEqual(layer_publish.versions(), expected)
                with patch('layer_publish.subprocess.run', side_effect=compile_fake) as compile_call:
                    manifest = layer_publish.publish(root, {'id':'story'}, {}, expected)
                    compile_call.assert_called_once()
                raw = (root/'layers'/manifest['id']/'pack.json').read_bytes()
                self.assertEqual(json.loads(raw)['baseMap']['revision'], canonical['baseMapRevision'])
                self.assertEqual(manifest['sha256'], hashlib.sha256(raw).hexdigest())
                self.assertEqual(manifest['bytes'], len(raw))
                with patch('layer_publish.subprocess.run', side_effect=AssertionError('不应重新编译')):
                    self.assertEqual(layer_publish.publish(root, {'id':'story'}, {}, expected), manifest)
                (root/'web/atlas.json').write_bytes(b'{"changed":true}')
                with self.assertRaisesRegex(ValueError, '尚未登记'):
                    layer_publish.versions()


if __name__ == '__main__':
    unittest.main()
