"""Acceptance-only post-refresh selector; --check uses installed Hermes preload, no model.

Future live invocation delegates to the existing acceptance routing/clarify wrapper.
This entrypoint does not edit configuration, model, prompt or provider routing.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import socket
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--experiment-root', required=True)
    parser.add_argument('--variant', choices=['baseline', 'boundary'], required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('hermes_args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    home = Path(os.environ['HERMES_HOME'])
    # Runs AFTER the normal Electron launcher has refreshed the base skill.
    activation = subprocess.run(['node', str(here / 'variants.mjs'), 'activate',
                                 args.experiment_root, args.variant, str(home)],
                                check=True, capture_output=True, text=True)
    receipt = json.loads(activation.stdout)
    if args.check:
        def offline(*unused, **kwargs):
            raise RuntimeError('Network forbidden in offline preload validation')
        socket.socket.connect = offline
        socket.create_connection = offline
        from agent.skill_commands import build_preloaded_skills_prompt
        from tools.skills_tool import skill_view
        prompt, loaded, missing = build_preloaded_skills_prompt(['weftcut'])
        assert loaded == ['weftcut'] and not missing
        selected = json.loads(skill_view('weftcut', preprocess=False))
        assert Path(selected['skill_dir']).resolve() == (home / 'skills/weftcut').resolve()
        experimental = args.variant == 'boundary'
        assert ('Speech-boundary comparison (isolated experiment)' in prompt) == experimental
        ref = 'references/editing-knowledge/speech-boundary-decisions.md'
        if experimental:
            content = json.loads(skill_view('weftcut', file_path=ref))['content']
            assert 'KEEP' in content and 'UNCERTAIN' in content
            receipt['reference_sha256'] = hashlib.sha256((home / 'skills/weftcut' / ref).read_bytes()).hexdigest()
        else:
            assert not (home / 'skills/weftcut' / ref).exists()
        receipt.update(preload_verified=True, loaded=loaded, missing=missing,
                       preload_sha256=hashlib.sha256(prompt.encode()).hexdigest(),
                       provider_inference_count=0)
        (home.parent / 'preload-check.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps(receipt))
        return
    if os.environ.get('SCLIP_PAID_HOLDOUT_OPT_IN') != '1':
        raise RuntimeError('Separate live A/B authorization is required')
    forwarded = args.hermes_args
    if forwarded[:1] == ['--']:
        forwarded = forwarded[1:]
    assert forwarded[:2] == ['-m', 'hermes_cli.main']
    sys.path.insert(0, str(here.parent / 'acceptance-routing'))
    sys.argv = ['hermes_acceptance.py', *forwarded]
    runpy.run_path(str(here.parent / 'acceptance-routing/hermes_acceptance.py'), run_name='__main__')


if __name__ == '__main__':
    main()
