// Utilities
export { cn } from './lib/utils';

// Registry utilities
export {
  queryRegistryStatus,
  queryRegistryStatusSimple,
  getResultStatus,
  getStatusLabel,
  getStatusDescription,
  formatBlockAsTime,
  isWalletCompromised,
  type RegistrationData,
  type AcknowledgementData,
  type RegistryStatusResult,
  type ResultStatus,
} from './lib/registry';

// Components
export { Alert, AlertTitle, AlertDescription } from './components/alert';
export { Badge } from './components/badge';
export { badgeVariants } from './components/badge-variants';
export { Button, buttonVariants } from './components/button';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from './components/card';
export { Checkbox } from './components/checkbox';
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './components/dialog';
export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
} from './components/form';
export { Input } from './components/input';
export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
} from './components/input-group';
export { Label } from './components/label';
export { Textarea } from './components/textarea';
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './components/popover';
export { Progress } from './components/progress';
export { ScrollArea, ScrollBar } from './components/scroll-area';
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/select';
export { Separator } from './components/separator';
export { Skeleton } from './components/skeleton';
export { Toaster } from './components/sonner';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './components/tooltip';

// Animation components
export { TextAnimate } from './components/text-animate';
export { TypingAnimation } from './components/typing-animation';
export { HyperText } from './components/hyper-text';
export { AnimatedBeam, type AnimatedBeamProps } from './components/animated-beam';

// Explorer link
export {
  ExplorerLink,
  getExplorerAddressUrl,
  getExplorerTxUrl,
  type ExplorerLinkProps,
  type ExplorerLinkType,
} from './components/explorer-link';

// Bridge logos
export { HyperlaneLogo, WormholeLogo, type BridgeLogoProps } from './components/bridge-logos';

// Web3 Icons (named exports from @web3icons/react)
// Next.js App Router doesn't support "export *" in client boundaries
export {
  // Network icons - L2s
  NetworkEthereum,
  NetworkBase,
  NetworkOptimism,
  NetworkArbitrumOne,
  NetworkPolygon,
  NetworkZksync,
  NetworkLinea,
  NetworkGnosis,
  NetworkCelo,
  // Network icons - L1s
  NetworkBinanceSmartChain,
  NetworkSolana,
  NetworkBitcoin,
  NetworkAvalanche,
  NetworkFantom,
  NetworkNearProtocol,
  NetworkCosmosHub,
  // Exchange icons
  ExchangeCoinbase,
  ExchangeKraken,
  ExchangeGemini,
  ExchangeBinance,
  // Wallet icons
  WalletMetamask,
  WalletRainbow,
  WalletCoinbase,
  WalletLedger,
  // Token icons
  TokenLINK,
} from '@web3icons/react';
