import type { GameNode, Study } from '../chess/types';

export interface MoveRow {
  id: string;
  number: number;
  white?: string;
  black?: string;
  depth: number;
}

/** Flatten each primary continuation, then its branches, into independently pageable rows. */
export function moveRows(study: Study): MoveRow[] {
  const rows: MoveRow[] = [];
  const line = (first: string, depth: number) => {
    const branches: string[] = [];
    let id: string | undefined = first;
    while (id) {
      const node: GameNode = study.nodes[id];
      const fields = study.nodes[node.parentId!].fen.split(' ');
      const white = fields[1] === 'w';
      const reply: string | undefined = white ? node.children[0] : undefined;
      rows.push({
        id,
        number: Number(fields[5]),
        white: white ? id : undefined,
        black: white ? reply : id,
        depth,
      });
      branches.push(...node.children.slice(1));
      if (reply) {
        branches.push(...study.nodes[reply].children.slice(1));
        id = study.nodes[reply].children[0];
      } else {
        id = node.children[0];
      }
    }
    for (const branch of branches) line(branch, depth + 1);
  };
  study.nodes[study.rootId].children.forEach((first, index) => line(first, index === 0 ? 0 : 1));
  return rows;
}
