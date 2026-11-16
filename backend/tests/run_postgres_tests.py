"""Real isolated PostgreSQL tests; no packages needed beyond Python stdlib.

Starts a NEW localhost-only cluster under backend/.local-test/, uses mock auth,
and stops its own cluster in finally. Never connects to a supplied/existing DB.
"""
from __future__ import annotations

import argparse
import concurrent.futures
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import uuid

ROOT = Path(__file__).resolve().parents[1]
CHECKS: list[dict] = []
COMMANDS: list[dict] = []
CONCURRENT: list[dict] = []


def q(value: object) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def j(value: object) -> str:
    return q(json.dumps(value, ensure_ascii=False)) + '::jsonb'


def check(name: str, condition: bool, observed: object = None) -> None:
    CHECKS.append({'name': name, 'passed': bool(condition), 'observed': observed})
    if not condition:
        raise AssertionError(f'{name}: {observed!r}')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--pg-bin', required=True, type=Path)
    args = parser.parse_args()
    suffix = '.exe' if os.name == 'nt' else ''
    bins = {n: str(args.pg_bin / (n + suffix)) for n in ['initdb', 'pg_ctl', 'psql']}
    for path in bins.values():
        if not Path(path).is_file():
            raise FileNotFoundError(path)

    run_dir = ROOT / '.local-test' / ('run-' + uuid.uuid4().hex[:12])
    run_dir.mkdir(parents=True, exist_ok=False)
    data_dir = run_dir / 'data'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    started = False
    suite_complete = False
    failure = None
    receipt = ROOT / 'tests' / 'last_run.json'
    env = dict(os.environ, PGCLIENTENCODING='UTF8')

    def run(cmd: list[str], stdin: str | None = None, expect_error: bool = False) -> subprocess.CompletedProcess:
        if Path(cmd[0]).stem == 'pg_ctl':
            # On Windows postgres descendants may keep pg_ctl's PIPE handles open.
            # A regular file lets pg_ctl exit without waiting for the server to exit.
            output_file = run_dir / ('pg_ctl-' + str(len(COMMANDS)) + '.log')
            with output_file.open('w', encoding='utf-8') as stream:
                result = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=stream,
                                        stderr=subprocess.STDOUT, timeout=40, env=env)
            result.stdout = output_file.read_text(encoding='utf-8', errors='replace')
            result.stderr = ''
        else:
            result = subprocess.run(cmd, input=stdin, text=True, encoding='utf-8', errors='replace',
                                    capture_output=True, timeout=40, env=env)
        if result.returncode != 0 and not expect_error:
            raise RuntimeError(f'Command failed: {cmd!r}\n{result.stdout}\n{result.stderr}')
        return result

    psql = [bins['psql'], '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
            '-P', 'pager=off', '-h', '127.0.0.1', '-p', str(port), '-U', 'postgres', '-d', 'postgres']

    def sql(source: str, user: str | None = None, role: str | None = None,
            error: str | None = None, hold: bool = False) -> str:
        prefix = ''
        if user:
            prefix = f'SET ROLE authenticated; SET "request.jwt.claim.sub" = {q(user)};\n'
        elif role:
            prefix = f'SET ROLE {role};\n'
        source = prefix + source
        if hold:
            source = 'BEGIN;\n' + source + '\nSELECT pg_sleep(0.12);\nCOMMIT;'
        result = run(psql, source, expect_error=error is not None)
        if error is not None:
            check('expected SQL denial: ' + error,
                  result.returncode != 0 and error in result.stderr,
                  {'exit_code': result.returncode, 'stderr': result.stderr.strip()})
        return result.stdout.strip()

    def rpc(name: str, args_sql: str, user: str, hold: bool = False) -> object:
        out = sql(f'SELECT public.hoopup_{name}({args_sql});', user=user, hold=hold)
        # psql renders SQL NULL as an empty field (API get_session intentionally returns NULL).
        rows = [line for line in out.splitlines() if line.strip()]
        return json.loads(rows[0]) if rows else None

    users = [str(uuid.uuid5(uuid.NAMESPACE_URL, 'hoopup-local-test-user-' + str(i))) for i in range(16)]
    host, a, b, outsider = users[:4]
    court = str(uuid.uuid4())

    def create(*, size: int = 3, guests: int = 0, policy: str = 'instant', request_id: str | None = None) -> dict:
        payload = {'title': 'Mock basketball session', 'courtId': court, 'startsAt': None,
                   'teamSize': size, 'guestCount': guests, 'joinPolicy': policy}
        return rpc('create_session', f'{q(request_id or uuid.uuid4())}::uuid,{j(payload)}', host)

    def summary(sid: str, user: str = host) -> dict:
        return rpc('get_session', q(sid), user)

    def join(sid: str, user: str, hold: bool = False) -> dict:
        return rpc('join_session', q(sid), user, hold)

    def update(sid: str, patch: dict) -> dict:
        return rpc('update_session', f'{q(sid)},{j(patch)}', host)

    def race(name: str, calls: list) -> list[dict]:
        barrier = threading.Barrier(len(calls))
        def worker(fn):
            barrier.wait(timeout=10)
            return fn()
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as pool:
            results = list(pool.map(worker, calls))
        CONCURRENT.append({'name': name, 'results': results})
        return results

    try:
        init = [bins['initdb'], '-D', str(data_dir), '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--no-locale']
        init_result = run(init)
        COMMANDS.append({'command': init, 'exit_code': init_result.returncode, 'stdout': init_result.stdout})
        start = [bins['pg_ctl'], '-D', str(data_dir), '-l', str(run_dir / 'postgres.log'),
                 '-o', f'-h 127.0.0.1 -p {port} -c fsync=off', '-w', 'start']
        started = True
        start_result = run(start)
        COMMANDS.append({'command': start, 'exit_code': start_result.returncode, 'stdout': start_result.stdout})
        sql((ROOT / 'tests' / 'bootstrap_auth.sql').read_text(encoding='utf-8'))
        for migration in sorted((ROOT / 'migrations').glob('*.sql')):
            result = run(psql + ['-f', str(migration)])
            COMMANDS.append({'command': psql + ['-f', str(migration)], 'exit_code': result.returncode,
                             'stdout': result.stdout, 'stderr': result.stderr})
        check('all core migrations apply on PostgreSQL', True)

        sql('SELECT * FROM public.sessions;', role='anon', error='permission denied')
        sql("SELECT public.hoopup_list_sessions('{}');", role='anon', error='permission denied')
        sql("SELECT public.hoopup_list_sessions('{}');", role='authenticated', error='authentication_required')
        sql('INSERT INTO auth.users(id) VALUES ' + ','.join('(' + q(u) + ')' for u in users) + ';')
        for i, user in enumerate(users):
            response = rpc('save_profile', j({'displayName': 'Mock Player ' + str(i)}), user)
            check('profile saved for authenticated user ' + str(i), response['profile']['id'] == user)
        sql(f'INSERT INTO public.courts(id,name) VALUES({q(court)},\'Mock Court A\');')

        request_id = str(uuid.uuid4())
        s = create(size=5, guests=2, request_id=request_id)['session']; sid = s['id']
        check('host counted exactly once with two guests', (s['confirmedCount'],s['occupiedCount'],s['seatsRemaining']) == (1,3,2), s)
        repeat = create(size=5, guests=2, request_id=request_id)
        check('create retry returns same session', repeat['code'] == 'already_created' and repeat['session']['id'] == sid)
        check('outsider action flags are booleans', all(isinstance(v,bool) for v in summary(sid,outsider)['actions'].values()))
        past = {'title':'Past','courtId':court,'startsAt':'2000-01-01T00:00:00Z','teamSize':3}
        check('past chosen start rejected', rpc('create_session', f'{q(uuid.uuid4())},{j(past)}',host)['code'] == 'start_in_past')
        check('instant join occupies one seat', join(sid,a)['session']['occupiedCount'] == 4)
        check('join retry is idempotent', join(sid,a)['code'] == 'already_joined')
        check('last seat reaches full', join(sid,b)['session']['displayStatus'] == 'full')
        check('additional join refused', join(sid,outsider)['code'] == 'session_full')
        check('guest increase cannot overfill', update(sid,{'guestCount':3})['code'] == 'capacity_conflict')
        sql(f"UPDATE public.sessions SET guest_count=3 WHERE id={q(sid)};", error='session_capacity_exceeded')
        sql(f"UPDATE public.session_members SET status='withdrawn' WHERE session_id={q(sid)} AND user_id={q(host)};",
            error='session_requires_confirmed_host')
        check('full excluded from feed', sid not in [x['id'] for x in rpc('list_sessions',"'{}'",outsider)])
        check('full included in my sessions', sid in [x['id'] for x in rpc('my_sessions','',a)])

        approval = create(guests=1,policy='approval')['session']['id']
        check('request waits for approval', join(approval,a)['code'] == 'pending')
        join(approval,b)
        check('pending requests do not occupy seats', summary(approval)['occupiedCount'] == 2)
        denied = rpc('decide_request',f'{q(approval)},{q(b)},true',a)
        check('non-host cannot approve', denied['code'] == 'forbidden')
        check('pending cannot read chat', sql(f'SELECT count(*) FROM public.messages WHERE session_id={q(approval)};',user=a) == '0')
        check('pending cannot send', rpc('send_message',f'{q(approval)},{q(uuid.uuid4())},\'hello\'',a)['code'] == 'forbidden')
        approved = rpc('decide_request',f'{q(approval)},{q(a)},true',host)
        check('approval fills available seat', approved['code'] == 'approved' and approved['session']['displayStatus'] == 'full')
        check('second approval checks current capacity', rpc('decide_request',f'{q(approval)},{q(b)},true',host)['code'] == 'session_full')
        check('pending cannot see others membership', sql(f'SELECT count(*) FROM public.session_members WHERE session_id={q(approval)};',user=b) == '1')
        check('withdrawal reopens full session', rpc('withdraw',q(approval),a)['session']['displayStatus'] == 'open')
        rpc('set_recruitment',f'{q(approval)},false',host)
        check('closed remains closed with free seat', summary(approval)['displayStatus'] == 'closed')
        check('closed refuses new join', join(approval,outsider)['code'] == 'recruitment_closed')
        check('host cannot withdraw', rpc('withdraw',q(approval),host)['code'] == 'host_cannot_withdraw')

        message_key = str(uuid.uuid4())
        sent = rpc('send_message',f'{q(sid)},{q(message_key)},\'meet at entrance\'',host)
        repeated = rpc('send_message',f'{q(sid)},{q(message_key)},\'changed body\'',host)
        check('message retry preserves original', repeated['code'] == 'already_sent' and repeated['message']['body'] == 'meet at entrance')
        message_id = sent['message']['id']
        check('member sees chat', sql(f'SELECT count(*) FROM public.messages WHERE session_id={q(sid)};',user=a) == '1')
        check('outsider sees no chat', sql(f'SELECT count(*) FROM public.messages WHERE session_id={q(sid)};',user=outsider) == '0')
        rpc('withdraw',q(sid),a)
        check('withdrawn member loses chat access', sql(f'SELECT count(*) FROM public.messages WHERE session_id={q(sid)};',user=a) == '0')
        for statement in [
            f"UPDATE public.sessions SET host_id={q(outsider)} WHERE id={q(sid)};",
            f"INSERT INTO public.session_members(session_id,user_id,status,confirmed_at) VALUES({q(sid)},{q(outsider)},'confirmed',now());",
            f"INSERT INTO public.messages(session_id,sender_id,client_message_id,body) VALUES({q(sid)},{q(host)},{q(uuid.uuid4())},'forged');",
            f"UPDATE public.profiles SET display_name='hijack' WHERE id={q(host)};"
        ]:
            sql(statement,user=outsider,error='permission denied')
        check('non-host cannot edit', rpc('update_session',f'{q(sid)},\'{{"title":"hijack"}}\'',outsider)['code'] == 'forbidden')
        check('patch cannot change host', update(sid,{'hostId':outsider})['code'] == 'invalid_input')

        blocked_sid = create()['session']['id']
        rpc('block_user',q(outsider),host)
        check('host block hides session from newcomer', summary(blocked_sid,outsider) is None)
        check('blocked newcomer cannot join', join(blocked_sid,outsider)['code'] == 'not_found')
        check('block list not exposed to blocked user', sql('SELECT count(*) FROM public.user_blocks;',user=outsider) == '0')
        rpc('unblock_user',q(outsider),host)
        check('unblock permits join', join(blocked_sid,outsider)['code'] == 'joined')
        rpc('block_user',q(outsider),host)
        check('blocking does not silently expel existing member', summary(blocked_sid,outsider)['myMembershipStatus'] == 'confirmed')
        rpc('unblock_user',q(outsider),host)
        check('outsider cannot report unseen message', rpc('report',f"'message',{q(message_id)},'test report'",outsider)['code'] == 'forbidden')
        check('member can report message', rpc('report',f"'message',{q(message_id)},'test report'",b)['code'] == 'reported')
        check('report visible only to reporter', sql('SELECT count(*) FROM public.reports;',user=b) == '1'
              and sql('SELECT count(*) FROM public.reports;',user=host) == '0')

        rpc('end_session',f'{q(sid)},\'completed\'',host)
        check('completed retains member chat read', sql(f'SELECT count(*) FROM public.messages WHERE session_id={q(sid)};',user=b) == '1')
        check('completed refuses new messages', rpc('send_message',f'{q(sid)},{q(uuid.uuid4())},\'late\'',b)['code'] == 'session_inactive')
        check('completed refuses new joins', join(sid,outsider)['code'] == 'session_inactive')
        check('terminal lifecycle cannot be changed', rpc('end_session',f'{q(sid)},\'cancelled\'',host)['code'] == 'session_inactive')

        racing = create(guests=1)['session']['id']
        outcomes = race('eight users compete for one seat',
                        [lambda u=u: join(racing,u,True) for u in users[1:9]])
        codes = [x['code'] for x in outcomes]
        check('exactly one winner for final seat', codes.count('joined') == 1 and codes.count('session_full') == 7, codes)
        check('capacity preserved after eight-way race', summary(racing)['occupiedCount'] == 3)

        competing = create(guests=1,policy='approval')['session']['id']
        join(competing,a)
        update(competing,{'joinPolicy':'instant'})
        outcomes = race('approval versus instant join',[
            lambda: rpc('decide_request',f'{q(competing)},{q(a)},true',host,True),
            lambda: join(competing,b,True)])
        check('approval/join race has one winner', sum(x['code'] in ('approved','joined') for x in outcomes) == 1,
              [x['code'] for x in outcomes])
        check('approval/join race preserves capacity', summary(competing)['occupiedCount'] == 3)

        guest_race = create()['session']['id']; join(guest_race,a)
        outcomes = race('guest increase versus join',[
            lambda: rpc('update_session',f'{q(guest_race)},{j({"guestCount":1})}',host,True),
            lambda: join(guest_race,b,True)])
        check('guest/join race has one successful seat mutation', sum(x['ok'] for x in outcomes) == 1,
              [x['code'] for x in outcomes])
        check('guest/join race preserves capacity', summary(guest_race)['occupiedCount'] == 3)

        cancel_race = create()['session']['id']
        race('cancel versus join',[
            lambda: rpc('end_session',f'{q(cancel_race)},\'cancelled\'',host,True),
            lambda: join(cancel_race,a,True)])
        check('cancel/join race leaves inactive session', summary(cancel_race)['lifecycle'] == 'cancelled')
        check('post-cancellation join refused', join(cancel_race,b)['code'] == 'session_inactive')

        invalid_payload = {'title':'','courtId':court,'teamSize':3}
        before = sql('SELECT count(*) FROM public.sessions;')
        sql(f'SELECT public.hoopup_create_session({q(uuid.uuid4())},{j(invalid_payload)});',user=host,error='check constraint')
        check('failed create leaves no partial session', sql('SELECT count(*) FROM public.sessions;') == before)
        sql(f"BEGIN; INSERT INTO public.sessions(host_id,client_request_id,court_id,title,starts_at,team_size,skill_level) VALUES({q(host)},{q(uuid.uuid4())},{q(court)},'orphan',now(),3,'casual'); COMMIT;",
            error='session_requires_confirmed_host')
        check('orphan session rolled back', sql('SELECT count(*) FROM public.sessions;') == before)
        check('no capacity violations in final state', sql("SELECT count(*) FROM public.sessions s WHERE guest_count+(SELECT count(*) FROM public.session_members m WHERE m.session_id=s.id AND status='confirmed')>team_size;") == '0')
        check('no public SECURITY DEFINER API', sql("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'hoopup_%' AND p.prosecdef;") == '0')
        check('authenticated cannot call invariant trigger function', sql("SELECT has_function_privilege('authenticated','hoopup_private.check_session_invariant()','EXECUTE');") == 'f')
        suite_complete = True
        print(f'PASS: {len(CHECKS)} checks; {len(CONCURRENT)} concurrent scenarios. Auth is a local SQL stub; no cloud deployment tested.')
    except Exception as exc:
        failure = f'{type(exc).__name__}: {exc}'
        print('FAIL: ' + failure, file=sys.stderr)
    finally:
        if started:
            stop = [bins['pg_ctl'], '-D', str(data_dir), '-m', 'fast', '-w', 'stop']
            result = run(stop, expect_error=True)
            COMMANDS.append({'command':stop,'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
            if result.returncode != 0:
                failure = (failure or '') + '\nFailed to stop the dedicated test cluster: ' + result.stderr
        if not suite_complete and failure is None:
            failure = 'Suite did not reach completion.'
        report = {
            'timeUtc':datetime.now(timezone.utc).isoformat(),
            'status':'passed' if suite_complete and failure is None else 'failed', 'failure':failure,
            'testCluster':str(run_dir), 'checks':CHECKS, 'concurrentScenarios':CONCURRENT,
            'commands':COMMANDS,
            'limits':['Local mock auth; no JWT verification, Supabase Data API, PostGIS, Realtime, push, or cloud deployment tested.']
        }
        serialized = json.dumps(report,ensure_ascii=False,indent=2)
        receipt.write_text(serialized,encoding='utf-8')
        (run_dir / 'receipt.json').write_text(serialized,encoding='utf-8')
        history_file = ROOT / 'tests' / 'validation_history.json'
        history = json.loads(history_file.read_text(encoding='utf-8')) if history_file.exists() else []
        history.append({'timeUtc':report['timeUtc'],'status':report['status'],'failure':failure,
                        'passedChecks':sum(x['passed'] for x in CHECKS),'testCluster':str(run_dir)})
        history_file.write_text(json.dumps(history,ensure_ascii=False,indent=2),encoding='utf-8')
        print('Receipt: ' + str(receipt))
    return 0 if suite_complete and failure is None else 1


if __name__ == '__main__':
    raise SystemExit(main())
