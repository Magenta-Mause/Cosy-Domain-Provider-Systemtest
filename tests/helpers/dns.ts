import { Resolver } from 'node:dns/promises';

/**
 * DNS-Checks gegen die AUTORITATIVEN Nameserver der Zone (Route53) statt gegen
 * Public Resolver: die cachen (auch negativ) und würden Create/Update/Delete-
 * Checks flaky bis unmöglich machen. Route53 propagiert Änderungen auf die
 * eigenen Nameserver in Sekunden.
 */

const zoneResolvers = new Map<string, Resolver>();

async function authoritativeResolverFor(fqdn: string): Promise<Resolver> {
  const systemResolver = new Resolver();
  const labels = fqdn.split('.').filter(Boolean);

  // Tiefste umschließende Zone finden: Labels von links abschneiden, bis ein
  // NS-Record existiert. Die Subdomain selbst hat keinen — sie liegt als
  // A-Record in der Hosted Zone. Die TLD wird bewusst nie angefragt.
  for (let i = 1; i < labels.length - 1; i++) {
    const zone = labels.slice(i).join('.');
    const cached = zoneResolvers.get(zone);
    if (cached) return cached;

    try {
      const nsHosts = await systemResolver.resolveNs(zone);
      const ips = (await Promise.all(nsHosts.map((host) => systemResolver.resolve4(host)))).flat();
      if (ips.length > 0) {
        const resolver = new Resolver();
        resolver.setServers(ips);
        zoneResolvers.set(zone, resolver);
        return resolver;
      }
    } catch {
      // Auf dieser Ebene keine Zone — eine Ebene höher probieren.
    }
  }

  throw new Error(`Keine autoritativen Nameserver für ${fqdn} gefunden`);
}

// "(Noch) kein Record" bzw. transiente Resolver-Antworten — der Aufrufer pollt weiter.
const RETRYABLE_DNS_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ETIMEOUT', 'ESERVFAIL', 'EREFUSED']);

/**
 * A-Records der FQDN direkt von den autoritativen Nameservern der Zone;
 * `[]` wenn (noch) kein Record existiert. Gedacht für Polling in Specs.
 */
export async function resolveAuthoritativeA(fqdn: string): Promise<string[]> {
  const resolver = await authoritativeResolverFor(fqdn);
  try {
    return (await resolver.resolve4(fqdn)).sort();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? '';
    if (RETRYABLE_DNS_CODES.has(code)) {
      return [];
    }
    throw error;
  }
}
