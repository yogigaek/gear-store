import type { BuildProblem, BuildSelection, ProductSummary } from '@gear-store/shared';

// The rules of the E-1 build as a pure function of the catalogue, so they can be tested without a database:
// one active part in each slot, each part in its own slot, no two parts that conflict, a colour the frame
// comes in, and enough stock for the number of bikes asked for.

export interface RulePart {
  id: string;
  isActive: boolean;
  /** the part's finishes, key → label */
  colors: Map<string, string>;
  summary: ProductSummary;
}

export interface RuleSlot {
  /** the slot's category slug, the key a selection uses */
  category: string;
  name: string;
}

export interface Rulebook {
  /** in build order */
  slots: RuleSlot[];
  parts: Map<string, RulePart>;
  /** unordered pairs of part slugs, keyed `${a}|${b}` with a < b */
  conflicts: Map<string, string>;
}

export interface CheckedBuild {
  /** the chosen parts that exist and sit in their slot, in build order */
  parts: { slot: RuleSlot; part: RulePart }[];
  colorKey: string;
  colorLabel: string | null;
  /** one bike, at today's prices of the parts it was priced from */
  unitPrice: number;
  problems: BuildProblem[];
}

export const conflictKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The bike's colour is the frame's; any finishes another part has are not chosen through a build. */
export const carriesColour = (part: RulePart) => part.summary.module === 'FRAME' && part.colors.size > 0;

export function checkBuild(book: Rulebook, selection: BuildSelection, quantity = 1): CheckedBuild {
  const problems: BuildProblem[] = [];
  const parts: CheckedBuild['parts'] = [];
  const slotNames = new Set(book.slots.map((s) => s.category));

  for (const key of Object.keys(selection.parts)) {
    if (!slotNames.has(key)) {
      problems.push({ kind: 'WRONG_SLOT', message: `The E-1 has no “${key}” slot.`, slots: [key] });
    }
  }

  for (const slot of book.slots) {
    const slug = selection.parts[slot.category];
    if (!slug) {
      problems.push({
        kind: 'MISSING_PART',
        message: `Choose ${article(slot.name)}.`,
        slots: [slot.category],
      });
      continue;
    }
    const part = book.parts.get(slug);
    if (!part || !part.isActive) {
      problems.push({
        kind: 'UNKNOWN_PART',
        message: 'That part is no longer sold.',
        slots: [slot.category],
      });
      continue;
    }
    if (part.summary.category !== slot.category) {
      problems.push({
        kind: 'WRONG_SLOT',
        message: `${part.summary.name} does not go in the ${slot.name.toLowerCase()} slot.`,
        slots: [slot.category],
      });
      continue;
    }
    if (part.summary.stock < quantity) {
      problems.push({
        kind: 'OUT_OF_STOCK',
        message:
          part.summary.stock === 0
            ? `${part.summary.name} is sold out.`
            : `Only ${part.summary.stock} of ${part.summary.name} left.`,
        slots: [slot.category],
      });
    }
    parts.push({ slot, part });
  }

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const reason = book.conflicts.get(
        conflictKey(parts[i]!.part.summary.slug, parts[j]!.part.summary.slug),
      );
      if (reason) {
        problems.push({
          kind: 'CONFLICT',
          message: reason,
          slots: [parts[i]!.slot.category, parts[j]!.slot.category],
        });
      }
    }
  }

  const painted = parts.find((p) => carriesColour(p.part));
  const colorLabel = painted?.part.colors.get(selection.colorKey) ?? null;
  if (painted && colorLabel === null) {
    problems.push({
      kind: 'UNKNOWN_COLOR',
      message: `${painted.part.summary.name} does not come in that colour.`,
      slots: [painted.slot.category],
    });
  }

  return {
    parts,
    colorKey: painted ? selection.colorKey : '',
    colorLabel,
    unitPrice: parts.reduce((sum, p) => sum + p.part.summary.price, 0),
    problems,
  };
}

function article(name: string) {
  const noun = name.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');
  return /^[aeiou]/.test(noun) ? `an ${noun}` : `a ${noun}`;
}
