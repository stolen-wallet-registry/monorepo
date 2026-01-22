/**
 * Dashboard Page
 *
 * Public transparency dashboard with role-gated admin actions.
 * - Public: View stats, registrations, operators
 * - Operators: + View submit guide
 * - DAO: + Manage operators
 */

import { Tabs, TabsContent, TabsList, TabsTrigger, Badge } from '@swr/ui';
import { ListOrdered, Users, Upload, Settings } from 'lucide-react';
import {
  DashboardStatsCards,
  RecentRegistrationsTable,
  OperatorsTable,
  OperatorSubmitGuide,
  ManageOperatorsPanel,
} from '@/components/dashboard';
import { useUserRole } from '@/hooks/dashboard';

/**
 * Role badge displayed next to user's wallet.
 */
function RoleBadge() {
  const { role, isLoading } = useUserRole();

  if (isLoading) return null;
  if (role === 'public') return null;

  return (
    <Badge variant={role === 'dao' ? 'default' : 'secondary'} className="ml-2">
      {role === 'dao' ? 'DAO' : 'Operator'}
    </Badge>
  );
}

export function DashboardPage() {
  const { role } = useUserRole();

  const showOperatorTab = role === 'operator' || role === 'dao';
  const showDAOTab = role === 'dao';

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center">
            <h1 className="text-3xl font-bold tracking-tight">Registry Dashboard</h1>
            <RoleBadge />
          </div>
          <p className="text-muted-foreground">
            Transparency view of the Stolen Wallet Registry ecosystem.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <DashboardStatsCards />

      {/* Tabs */}
      <Tabs defaultValue="registrations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="registrations" className="gap-2">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Recent</span>
          </TabsTrigger>
          <TabsTrigger value="operators" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Operators</span>
          </TabsTrigger>
          {showOperatorTab && (
            <TabsTrigger value="submit" className="gap-2">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Submit</span>
            </TabsTrigger>
          )}
          {showDAOTab && (
            <TabsTrigger value="manage" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Manage</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="registrations">
          <RecentRegistrationsTable />
        </TabsContent>

        <TabsContent value="operators">
          <OperatorsTable />
        </TabsContent>

        {showOperatorTab && (
          <TabsContent value="submit">
            <OperatorSubmitGuide />
          </TabsContent>
        )}

        {showDAOTab && (
          <TabsContent value="manage">
            <ManageOperatorsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
