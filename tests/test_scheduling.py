"""Run the actual workflow guard and claim script against temporary Git remotes."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / '.github/workflows/daily-story.yml').read_text()
GUARD = WORKFLOW.split('      - name: Check daily guard before expensive setup\n', 1)[1].split('        run: |\n', 1)[1].split('\n      - name:', 1)[0]
GUARD = '\n'.join(line[10:] for line in GUARD.splitlines())

def run(*args, cwd, env=None, check=True):
    return subprocess.run(args, cwd=cwd, env=env, check=check, capture_output=True, text=True)

class Safety(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.remote = self.root / 'remote.git'
        run('git', 'init', '--bare', str(self.remote), cwd=self.root)
        self.repo = self.root / 'repo'
        run('git', 'clone', str(self.remote), str(self.repo), cwd=self.root)
        for key, value in [('user.name', 'test'), ('user.email', 'test@example.com')]:
            run('git', 'config', key, value, cwd=self.repo)
        run('git', 'checkout', '-b', 'published', cwd=self.repo)
        self.save('last_posted.txt', '2026-10-22')
        run('git', 'push', '-u', 'origin', 'published', cwd=self.repo)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        date = self.bin / 'date'
        date.write_text('#!/bin/sh\ncase "$1" in +%F) echo "$TEST_DATE";; +%H%M) echo "$TEST_TIME";; *) exit 2;; esac\n')
        date.chmod(0o755)
        self.env = dict(os.environ, PATH=str(self.bin)+os.pathsep+os.environ['PATH'], TEST_DATE='2026-10-23', TEST_TIME='0810', POST_DATE='2026-10-23', GITHUB_OUTPUT=str(self.root/'output'), GITHUB_STEP_SUMMARY=str(self.root/'summary'))
    def save(self, file, value):
        (self.repo / file).write_text(value+'\n')
        run('git', 'add', file, cwd=self.repo)
        run('git', 'commit', '-m', 'test state', cwd=self.repo)
    def guard(self):
        return run('bash', '-e', '-c', GUARD, cwd=self.repo, env=self.env, check=False)
    def claim(self):
        return run('bash', str(ROOT/'scripts/claim-post.sh'), cwd=self.repo, env=self.env, check=False)
    def test_fresh_day_then_pending_blocks_duplicate(self):
        self.assertEqual(self.guard().returncode, 0)
        self.assertNotIn('skip=yes', (self.root/'output').read_text())
        self.assertEqual(self.claim().returncode, 0)
        self.assertNotEqual(self.guard().returncode, 0)
        pending = run('git', '--git-dir='+str(self.remote), 'show', 'published:pending_post.txt', cwd=self.repo).stdout.strip()
        self.assertEqual(pending, '2026-10-23')
    def test_completed_day_skips(self):
        self.save('last_posted.txt', '2026-10-23')
        run('git', 'push', cwd=self.repo)
        self.assertEqual(self.guard().returncode, 0)
        self.assertIn('skip=yes', (self.root/'output').read_text())
    def test_early_request_skips(self):
        self.env['TEST_TIME'] = '0809'
        self.assertEqual(self.guard().returncode, 0)
        self.assertIn('skip=yes', (self.root/'output').read_text())
        self.assertNotEqual(self.claim().returncode, 0)
    def test_failed_fetch_does_not_allow_post(self):
        run('git', 'remote', 'set-url', 'origin', str(self.root/'missing'), cwd=self.repo)
        self.assertNotEqual(self.guard().returncode, 0)
    def test_failed_push_prevents_claim(self):
        hook = self.remote/'hooks/pre-receive'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        self.assertNotEqual(self.claim().returncode, 0)
        self.assertNotEqual(run('git', '--git-dir='+str(self.remote), 'cat-file', '-e', 'published:pending_post.txt', cwd=self.repo, check=False).returncode, 0)
    def test_midnight_change_prevents_publish(self):
        self.env['TEST_DATE'] = '2026-10-24'
        self.assertNotEqual(self.claim().returncode, 0)
    def test_previous_day_pending_allows_new_day(self):
        self.save('pending_post.txt', '2026-10-22')
        run('git', 'push', cwd=self.repo)
        self.assertEqual(self.guard().returncode, 0)
        self.assertEqual(self.claim().returncode, 0)

if __name__ == '__main__':
    unittest.main()
