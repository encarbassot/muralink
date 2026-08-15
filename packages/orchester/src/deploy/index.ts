// @muralink/orchester deploy layer — putting an instance on a machine.
//
// Two consumers: the CLI wizard (interactive, packages/orchester/src/cli/Wizard.tsx)
// and `orchester-deploy` (headless, cli.ts) for scripted installs and SSH runs.
// Both drive the same DEPLOY_STEPS, so what an operator does by hand and what a
// script does unattended can never drift apart.

export {
  DEPLOY_STEPS, checkAll, stepById,
  type DeployStep, type StepContext, type StepReport, type StepState,
} from './steps'
export {
  defaultConfig, loadDeployConfig, saveDeployConfig, newApiToken,
  publicUrl, runtimeEnv, DEPLOY_STATE,
  type DeployConfig, type TlsMode, type WebServer,
} from './config'
export {
  applySite, nginxStatus, reloadNginx, renderSite, siteLayout,
  ACME_WEBROOT, SITE_NAME,
  type NginxSiteConfig, type NginxStatus,
} from './nginx'
export {
  acmePaths, certInfo, ensureSelfSigned, installRenewHook, issueAcme,
  renewNow, renewalStatus, selfSignedPaths,
  type CertInfo, type CertPair,
} from './certs'
export {
  installUnit, journal, renderUnit, restartUnit, systemdStatus,
  ENV_PATH, UNIT_NAME, UNIT_PATH,
  type SystemdStatus, type UnitOptions,
} from './systemd'
export {
  dnsA, hostInfo, portFree, publicIp, run, runPrivileged, which,
  type HostInfo, type RunResult,
} from './system'
