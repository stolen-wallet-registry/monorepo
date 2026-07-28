/**
 * Chain badge shared by the batch summary and the batch entries table.
 */

import { Badge, NetworkIcon, Tooltip, TooltipContent, TooltipTrigger } from '@swr/ui';
import { Globe } from 'lucide-react';
import { truncateHash } from '@swr/search';
import { getChainDisplayFromCaip2 } from '@/lib/chains';

/**
 * Renders the chain badge for a batch row.
 *
 * Module scope, not a closure inside a component: it depends only on its arguments,
 * so defining it per render allocated a new function for nothing.
 */
export function renderChainBadge(caip2?: string, showCaip2Detail = false, chainIdHash?: string) {
  const chain = getChainDisplayFromCaip2(caip2);
  const showNetworkIcon = chain.isKnown && !chain.isLocal;
  const icon = showNetworkIcon ? (
    chain.chainId ? (
      <NetworkIcon chainId={chain.chainId} variant="branded" size={12} />
    ) : chain.caip2 ? (
      <NetworkIcon caip2id={chain.caip2} variant="branded" size={12} />
    ) : (
      <Globe className="h-3 w-3" />
    )
  ) : (
    <Globe className="h-3 w-3" />
  );

  if (showCaip2Detail && caip2) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="outline" className="text-xs inline-flex items-center gap-1 w-fit">
          {icon}
          {chain.shortName}
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground">
              {caip2}
              {chainIdHash && ` (${truncateHash(chainIdHash, 4, 4)})`}
            </span>
          </TooltipTrigger>
          {chainIdHash && (
            <TooltipContent side="bottom">
              <p className="text-xs font-mono break-all">{chainIdHash}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    );
  }

  return (
    <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
      {icon}
      {chain.shortName}
    </Badge>
  );
}
