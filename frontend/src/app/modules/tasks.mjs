import { hydratePrototypeDomain } from "/assets/app/modules/shared-ui.mjs";

export async function hydrateRoute(context) {
  await hydratePrototypeDomain(context, "tasks");
}
