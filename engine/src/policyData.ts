// Company policies (review wave 3, "like civics"): standing choices with trade-offs. Their effects use the same
// modifiers as investments (InvFx), so every system that reads investment effects reads policies too.
import type { InvFx } from './types';

export interface PolicyDef { id: string; name: string; desc: string; fx: InvFx; lesson: string }

export const POLICIES: PolicyDef[] = [
  { id: 'remote', name: 'Remote-first', desc: 'Rent 40% lower and a wider hiring pool; productivity 4% lower and culture drifts down.',
    fx: { rent: -40, hirePool: 25, prod: -4, culture: -0.15 }, lesson: 'Remote work trades office costs and access to talent against the informal learning and cohesion of a shared place.' },
  { id: 'founderSales', name: 'Founder-led sales', desc: 'Sales effort 20% more effective; R&D 12% less effective, because the founder cannot be in two places.',
    fx: { salesEff: 20, rdEff: -12 }, lesson: 'A founder is the best salesperson a young company has, and the scarcest resource. Every hour selling is an hour not spent building.' },
  { id: 'vertical', name: 'Vertical integration', desc: 'Inputs 12% cheaper because you make your own; wages 4% higher for the extra people.',
    fx: { inputCost: -12, wageCost: 4 }, lesson: 'Making your own inputs captures the supplier’s margin and control, at the price of more people, more fixed cost and less flexibility.' },
  { id: 'assetLight', name: 'Asset-light', desc: 'New plant costs 35% less because you lease it; inputs 6% dearer because partners take a margin.',
    fx: { capexCost: -35, inputCost: 6 }, lesson: 'Leasing and outsourcing turn fixed assets into running costs: faster and cheaper to grow, thinner margins once you have.' },
  { id: 'premium', name: 'Premium brand', desc: 'Quality +4 and brand builds faster; 6% fewer customers at any given price.',
    fx: { quality: 4, brand: 0.4, demand: -6 }, lesson: 'A premium position sells fewer units at higher prices. It pays when customers value quality more than you lose in volume.' },
  { id: 'zeroBased', name: 'Zero-based budget', desc: 'Head-office costs 15% lower; morale 3 lower and R&D 8% less effective.',
    fx: { overhead: -15, morale: -3, rdEff: -8 }, lesson: 'Justifying every cost from zero finds waste, and also cuts things whose value is hard to prove — like research and goodwill.' },
];
export const POLICY: Record<string, PolicyDef> = Object.fromEntries(POLICIES.map((p) => [p.id, p]));
