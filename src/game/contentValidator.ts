import type { ContentPack, StoryNode } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function referencedNodeIds(node: StoryNode): string[] {
  return [
    node.next,
    ...(node.choices ?? []).flatMap((choice) => [choice.next, choice.check?.next]),
  ].filter((value): value is string => Boolean(value));
}

export function validateContentPack(pack: ContentPack): ValidationResult {
  const errors: string[] = [];
  const unitIds = new Set(pack.units.map((unit) => unit.id));
  const battleIds = new Set(pack.battles.map((battle) => battle.id));
  const contractIds = new Set(pack.contracts.map((contract) => contract.id));

  if (!pack.manifest.id.trim()) errors.push('Manifest id is required.');
  if (!pack.manifest.version.trim()) errors.push('Manifest version is required.');
  for (const contractId of pack.manifest.contractIds) {
    if (!contractIds.has(contractId)) errors.push(`Manifest references missing contract: ${contractId}`);
  }

  for (const battle of pack.battles) {
    const placementIds = new Set<string>();
    for (const placement of [...battle.heroes, ...battle.enemies]) {
      if (!unitIds.has(placement.templateId)) {
        errors.push(`Battle ${battle.id} references missing unit template: ${placement.templateId}`);
      }
      if (placementIds.has(placement.id)) errors.push(`Battle ${battle.id} has duplicate placement id: ${placement.id}`);
      placementIds.add(placement.id);
      if (placement.x < 0 || placement.y < 0 || placement.x >= battle.width || placement.y >= battle.height) {
        errors.push(`Battle ${battle.id} has out-of-bounds placement: ${placement.id}`);
      }
    }
  }

  for (const contract of pack.contracts) {
    const nodeIds = new Set(contract.story.map((node) => node.id));
    if (!nodeIds.has(contract.startNodeId)) errors.push(`Contract ${contract.id} has missing start node.`);
    for (const node of contract.story) {
      if (node.type === 'battle' && (!node.battleId || !battleIds.has(node.battleId))) {
        errors.push(`Story node ${node.id} references a missing battle.`);
      }
      for (const target of referencedNodeIds(node)) {
        if (!nodeIds.has(target)) errors.push(`Story node ${node.id} references missing node: ${target}`);
      }
      if (node.type === 'choice' && !(node.choices?.length)) errors.push(`Choice node ${node.id} has no choices.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
