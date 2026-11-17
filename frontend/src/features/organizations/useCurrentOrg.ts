import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import type { OrganizationSummary } from '@/lib/types';
import { useAuthStore } from '@/features/auth/store';

export function useCurrentOrg() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const setLastOrgSlug = useAuthStore((s) => s.setLastOrgSlug);

  const orgsQuery = useQuery({
    queryKey: queryKeys.orgs,
    queryFn: () => api.get<OrganizationSummary[]>('/api/v1/organizations'),
  });

  const orgs = orgsQuery.data ?? [];
  const org = orgs.find((o) => o.slug === orgSlug) ?? null;

  useEffect(() => {
    if (org) {
      setLastOrgSlug(org.slug);
    }
  }, [org, setLastOrgSlug]);

  return {
    org,
    orgs,
    isLoading: orgsQuery.isLoading,
    isError: orgsQuery.isError,
  };
}

