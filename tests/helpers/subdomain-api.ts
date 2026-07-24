import type { APIRequestContext } from '@playwright/test';
import { fetchIdentityToken } from './auth-api';

export type SubdomainInfo = {
  uuid: string;
  label?: string;
  fqdn?: string;
  targetIp?: string;
  status?: string;
};

/** Holt eine Subdomain über die User-API (Bearer-Identity-Token aus der Cookie-Session). */
export async function fetchSubdomain(api: APIRequestContext, uuid: string): Promise<SubdomainInfo> {
  const identityToken = await fetchIdentityToken(api);
  const res = await api.get(`/api/v1/subdomain/${uuid}`, {
    headers: { Authorization: `Bearer ${identityToken}` },
  });
  if (!res.ok()) {
    throw new Error(
      `Subdomain ${uuid} konnte nicht geladen werden: ${res.status()} ${await res.text()}`,
    );
  }
  return (await res.json()) as SubdomainInfo;
}
