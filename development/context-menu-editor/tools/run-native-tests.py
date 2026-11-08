"""Run disposable native checks from the normal Windows user session.

One disposable headless Zen at a time. By default the run stops at the first
failed stage; --keep-going runs every stage and reports each one. --only runs
selected stages, and --source installs another runtime folder (for baselines).
"""
from pathlib import Path
import argparse
import json
import subprocess
import sys
import uuid

ROOT=Path(__file__).absolute().parent.parent

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keep-going',action='store_true',help='Run every stage even after a failure')
    parser.add_argument('--only',help='Comma-separated stage names to run')
    parser.add_argument('--source',type=Path,help='Runtime folder to install instead of the built one')
    parser.add_argument('--label',default='normal-session',help='Prefix for the run folder name')
    options=parser.parse_args()
    output=ROOT/'.backup-scratch/native'/(options.label+'-'+uuid.uuid4().hex)
    output.mkdir(parents=True,exist_ok=False)
    jobs=[('startup','tests/native/startup-diagnostic.js',True),
        ('sine-settings','tests/native/sine-integration.js',False),
        ('menu-behavior','tests/native/menu-behavior.js',False),
        ('menu-layout','tests/native/menu-layout.js',False),
        ('settings-behavior','tests/native/settings-behavior.js',False),
        ('popover-ui','tests/native/popover-ui.js',False),
        ('pointer-behavior','tests/native/pointer-behavior.js',False),
        ('settings-integrity','tests/native/settings-integrity.js',False),
        ('presentation-matrix','tests/native/presentation-matrix.js',False),
        ('icon-input-behavior','tests/native/icon-input-behavior.js',False),
        ('context-matrix','tests/native/context-matrix.js',False),
        ('places-behavior','tests/native/places-behavior.js',False),
        ('define-word-editor-first','tests/native/define-word-behavior.js',False),
        ('define-word-first','tests/native/define-word-behavior.js',False),
        ('local-mods-editor-first','tests/native/local-mods-behavior.js',False),
        ('local-mods-editor-last','tests/native/local-mods-behavior.js',False),
        ('submenu-geometry','tests/native/submenu-geometry.js',False),
        ('menu-stress','tests/native/menu-stress.js',False),
        ('process-restart','tests/native/restart-setup.js',False),
        ('legacy-import','tests/native/legacy-import-setup.js',False),
        ('hands-on-launcher','tests/native/interactive-setup.js',False),
        ('compatibility-launcher','tests/native/interactive-setup.js',False)]
    if options.only:
        wanted=[name.strip() for name in options.only.split(',') if name.strip()]
        unknown=[name for name in wanted if name not in [job[0] for job in jobs]]
        if unknown:parser.error('Unknown stage: '+', '.join(unknown))
        jobs=[job for job in jobs if job[0] in wanted]
    outcomes=[]
    for index,(name,script,vanilla) in enumerate(jobs,1):
        print(f'[{index}/{len(jobs)}] {name}: launching a new disposable Zen profile',flush=True)
        report=output/(name+'.json')
        command=[sys.executable,'tools/native-sine-probe.py','--launch','--script',script,'--output',str(report)]
        if name=='process-restart':command=[sys.executable,'tools/native-restart-test.py','--launch','--output',str(report)]
        if name=='legacy-import':command=[sys.executable,'tools/native-restart-test.py','--launch','--scenario','legacy-import','--output',str(report)]
        if options.source:command+=['--source',str(options.source)]
        if vanilla:command.append('--diagnostic-vanilla')
        if name=='sine-settings':command+=['--screenshot',str(output/'sine-settings.png')]
        if name=='popover-ui':command+=['--screenshot',str(output/'popover-ui.png')]
        if name.startswith('define-word-'):
            command+=['--with-define-word','--dictionary-fixture','--content-page','tests/native/sample-page.html','--select-text','browser','--open-content-menu']
            if name=='define-word-first':command.append('--define-word-first')
        if name=='hands-on-launcher':command+=['--with-define-word','--content-page','tests/native/sample-page.html']
        if name in ('context-matrix','places-behavior'):
            command+=['--content-page','tests/native/context-page.html','--content-http','--disable-media-sanity']
        if name.startswith('local-mods-') or name in ('compatibility-launcher','menu-stress','submenu-geometry','menu-layout'):
            command+=['--with-local-mods','--with-define-word','--content-page','tests/native/sample-page.html','--content-http']
            if name=='local-mods-editor-last':command.append('--define-word-first')
            if name=='local-mods-editor-first':command+=['--screenshot',str(output/'compatibility-settings.png')]
        result=subprocess.run(command,cwd=ROOT)
        detail={};receipt_error=None;stage_exit=result.returncode
        try:detail=json.loads(report.read_text(encoding='utf-8'))
        except (OSError,ValueError) as error:receipt_error='Native report unavailable: '+str(error)
        checks=detail.get('probe',{}).get('result',{}).get('checks',{})
        if stage_exit==0 and (receipt_error or detail.get('error') or detail.get('probe',{}).get('ok') is not True or not checks or any(value is not True for value in checks.values()) or detail.get('checksPassed') is not True or detail.get('processExitCode')!=0):
            stage_exit=1;receipt_error=receipt_error or 'Native stage did not produce a complete successful report.'
        outcome={'test':name,'exitCode':stage_exit,'report':str(report)}
        if receipt_error:outcome['receiptError']=receipt_error
        outcomes.append(outcome)
        if stage_exit:
            failure=receipt_error or detail.get('error') or detail.get('probe',{}).get('error') or detail.get('probe',{}).get('result',{}).get('details',{}).get('error')
            failed=[key for key,value in checks.items() if value is not True]
            if failure:print('Failure: '+failure,flush=True)
            if failed:print('Failed checks: '+', '.join(failed),flush=True)
            if not options.keep_going:
                print('Stopped at the first failed check. No existing profile was used.',flush=True)
                break
    summary=output/'result.json'
    for row in outcomes:print(('PASS ' if not row['exitCode'] else 'FAIL ')+row['test'],flush=True)
    summary.write_text(json.dumps({'checks':outcomes,'allPassed':len(outcomes)==len(jobs) and all(not row['exitCode'] for row in outcomes)},indent=2),encoding='utf-8')
    passed=len(outcomes)==len(jobs) and all(not row['exitCode'] for row in outcomes)
    print(('PASS: all '+str(len(jobs))+' native checks passed.' if passed else 'FAIL: native checks are incomplete.'),flush=True)
    print('Result: '+str(summary),flush=True)
    return 0 if len(outcomes)==len(jobs) and all(not row['exitCode'] for row in outcomes) else 1

if __name__=='__main__':
    raise SystemExit(main())
