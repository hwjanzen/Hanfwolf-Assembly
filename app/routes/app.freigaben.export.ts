import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getRopeConfiguratorConfig } from "../services/rope-configurator-setup.server";
import {
  loadRopeReleases,
  ropeReleasesToCsv,
} from "../services/rope-releases.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const config = await getRopeConfiguratorConfig(session.shop);
  const { releases } = await loadRopeReleases(admin, config);
  return new Response(ropeReleasesToCsv(releases), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="seilfreigaben.csv"',
      "Cache-Control": "no-store",
    },
  });
};
