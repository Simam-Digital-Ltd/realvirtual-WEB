/**
 * ContextMenuLayer — Renders the plugin-extensible context menu.
 *
 * Uses MUI Menu with anchorReference="anchorPosition" for pixel-perfect
 * placement at the right-click / long-press position. Items are pre-filtered
 * and sorted by ContextMenuStore.open() — this component only renders.
 *
 * - Items with `danger: true` get red text (#ef5350)
 * - Items with `dividerBefore: true` get a <Divider /> above them
 * - Click handler: call item.action(target), then store.close()
 * - MUI handles close-on-click-outside and Escape natively
 */

import { useCallback } from 'react';
import { Menu, MenuItem, Divider } from '@mui/material';
import { useViewer } from '../../hooks/use-viewer';
import { useContextMenu } from './context-menu-store';
import type { ContextMenuTarget, ResolvedContextMenuItem } from './context-menu-store';

export function ContextMenuLayer() {
  const viewer = useViewer();
  const snap = useContextMenu(viewer.contextMenu);

  const handleClose = useCallback(() => {
    viewer.contextMenu.close();
  }, [viewer]);

  const handleItemClick = useCallback(
    (item: ResolvedContextMenuItem, target: ContextMenuTarget) => {
      try {
        item.action(target);
      } catch (e) {
        console.error(`[ContextMenu] Action '${item.id}' error:`, e);
      }
      viewer.contextMenu.close();
    },
    [viewer],
  );

  if (!snap.open || !snap.pos || !snap.target) return null;

  return (
    <Menu
      open
      onClose={handleClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: snap.pos.y, left: snap.pos.x }}
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'rgba(30, 30, 30, 0.95)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            minWidth: 160,
            '& .MuiMenuItem-root': {
              fontSize: 13,
              py: 0.5,
              px: 1.5,
            },
          },
        },
      }}
    >
      {snap.items.map((item, i) => [
        item.dividerBefore && i > 0 && (
          <Divider key={`div-${item.id}`} sx={{ my: 0.5, borderColor: 'rgba(255,255,255,0.08)' }} />
        ),
        <MenuItem
          key={item.id}
          onClick={() => handleItemClick(item, snap.target!)}
          sx={{
            color: item.danger ? '#ef5350' : 'text.primary',
            '&:hover': {
              bgcolor: item.danger ? 'rgba(239, 83, 80, 0.12)' : 'rgba(255,255,255,0.06)',
            },
          }}
        >
          {item.resolvedLabel}
        </MenuItem>,
      ])}
    </Menu>
  );
}
