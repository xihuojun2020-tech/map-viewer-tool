"""Run on the server; write a new installation credential to a private file."""
import argparse
import os
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'backend'))
from library import Library

parser = argparse.ArgumentParser()
parser.add_argument('installation')
parser.add_argument('output', type=Path)
args = parser.parse_args()
library = Library(Path(os.environ.get('MAPTOOL_STATE', '/var/lib/map-tool')))
# Exclusive creation prevents replacing an installation's only credential.
with args.output.open('x', encoding='utf-8') as file:
    os.chmod(args.output, 0o600)
    file.write(library.issue_token(args.installation))
print('已签发独立内测凭据；凭据只保存在指定私密文件。')
