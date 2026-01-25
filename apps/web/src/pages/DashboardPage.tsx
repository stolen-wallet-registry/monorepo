/**
 * Dashboard Page
 *
 * Public transparency dashboard with role-gated admin actions.
 * - Public: View stats, registrations, operators
 * - Operators: + View submit guide
 * - DAO: + Manage operators (integrated into Operators tab)
 */

import { useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger, Badge } from '@swr/ui';
import { ListOrdered, Users, Upload, Layers } from 'lucide-react';
import {
  DashboardStatsCards,
  RecentRegistrationsTable,
  BatchesTable,
  OperatorsTable,
  OperatorSubmitGuide,
} from '@/components/dashboard';
import { useUserRole, type UserRole } from '@/hooks/dashboard';
import { logger } from '@/lib/logger';

const VALID_TABS = new Set(['operators', 'submit', 'registrations', 'batches']);

const getTabFromSearch = (search: string) => {
  const tab = new URLSearchParams(search).get('tab');
  return tab && VALID_TABS.has(tab) ? tab : null;
};

interface RoleBadgeProps {
  role: UserRole;
  isLoading: boolean;
}

/**
 * Role badge displayed next to user's wallet.
 */
function RoleBadge({ role, isLoading }: RoleBadgeProps) {
  if (isLoading) return null;
  if (role === 'public') return null;

  return (
    <Badge variant={role === 'dao' ? 'default' : 'secondary'} className="ml-2">
      {role === 'dao' ? 'DAO' : 'Operator'}
    </Badge>
  );
}

export function DashboardPage() {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const { role, isLoading, isDAO } = useUserRole();
  const activeTab = getTabFromSearch(search) ?? 'registrations';

  // Compute tab visibility based on role
  // Default to showing only public tabs while loading to prevent layout shift
  const showSubmitTab = !isLoading && (role === 'operator' || role === 'dao');

  // Auto-reset to registrations if current tab becomes unavailable (e.g., wallet disconnect)
  const effectiveTab = activeTab === 'submit' && !showSubmitTab ? 'registrations' : activeTab;

  const basePath = location.split('?')[0] || '/dashboard';
  const currentLocation = search ? `${basePath}${search}` : basePath;

  // Keep URL in sync with the effective tab (visible tab)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextLocation =
      effectiveTab === 'registrations' ? basePath : `${basePath}?tab=${effectiveTab}`;
    if (nextLocation !== currentLocation) {
      setLocation(nextLocation);
    }
  }, [effectiveTab, basePath, currentLocation, setLocation]);

  const handleTabChange = (value: string) => {
    const nextLocation = value === 'registrations' ? basePath : `${basePath}?tab=${value}`;
    logger.ui.debug('Dashboard tab change', { value, nextLocation, currentLocation });
    if (nextLocation !== currentLocation) {
      setLocation(nextLocation);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold tracking-tight">Registry Dashboard</h1>
            <RoleBadge role={role} isLoading={isLoading} />
          </div>
          <p className="text-muted-foreground">
            Transparency view of the Stolen Wallet Registry ecosystem.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <DashboardStatsCards />

      {/* Tabs - aligned right */}
      <Tabs value={effectiveTab} onValueChange={handleTabChange} className="space-y-4">
        <div className="flex justify-end">
          <TabsList>
            <TabsTrigger value="registrations" className="gap-2">
              <ListOrdered className="h-4 w-4" />
              <span className="hidden sm:inline">Recent</span>
            </TabsTrigger>
            <TabsTrigger value="operators" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Operators</span>
            </TabsTrigger>
            <TabsTrigger value="batches" className="gap-2">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Batches</span>
            </TabsTrigger>
            {showSubmitTab && (
              <TabsTrigger value="submit" className="gap-2">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">{role === 'dao' ? 'DAO Submit' : 'Submit'}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="registrations">
          <RecentRegistrationsTable />
        </TabsContent>

        <TabsContent value="operators">
          <OperatorsTable canManage={isDAO} />
        </TabsContent>

        <TabsContent value="batches">
          <BatchesTable />
        </TabsContent>

        {showSubmitTab && (
          <TabsContent value="submit">
            <OperatorSubmitGuide />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
