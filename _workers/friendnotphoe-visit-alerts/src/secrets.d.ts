// Set only with `wrangler secret put` by the site owner; absent until then.
interface RoutineSecrets {
  ROUTINE_WEBHOOK_URL?: string;
  ROUTINE_WEBHOOK_BEARER?: string;
}
interface Env extends RoutineSecrets {}
declare namespace Cloudflare {
  interface Env extends RoutineSecrets {}
}
