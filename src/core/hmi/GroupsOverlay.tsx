/**
 * GroupsOverlay — Floating panel listing all scene groups with visibility
 * toggle switches and isolate buttons.
 *
 * Uses ChartPanel for the reusable drag/resize/title-bar infrastructure.
 * Responds to groups-overlay-toggle events from RVViewer.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Switch, IconButton, Typography, Button, Divider, List,
  ListItem, ListItemText, ListItemSecondaryAction,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useGroupsOverlayOpen } from '../../hooks/use-groups-overlay';
import { ChartPanel } from './ChartPanel';
import { BOTTOM_BAR_HEIGHT } from './BottomBar';
import {
  loadGroupVisibilitySettings,
  saveGroupVisibilitySettings,
  type GroupVisibilitySettings,
} from './group-visibility-store';
import type { GroupInfo } from '../engine/rv-group-registry';

const DEFAULT_W = 320;
const DEFAULT_H = 360;
const BOTTOM_MARGIN = BOTTOM_BAR_HEIGHT + 12;

/** Dark-gray scrollbar style class — reuse the pattern from BottomBar. */
const SCROLL_CLASS = 'rv-groups-scroll';
const scrollStyleId = 'rv-groups-scroll-style';
if (typeof document !== 'undefined' && !document.getElementById(scrollStyleId)) {
  const style = document.createElement('style');
  style.id = scrollStyleId;
  style.textContent = `
    .${SCROLL_CLASS} { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.25) transparent; }
    .${SCROLL_CLASS}::-webkit-scrollbar { width: 6px; }
    .${SCROLL_CLASS}::-webkit-scrollbar-track { background: transparent; }
    .${SCROLL_CLASS}::-webkit-scrollbar-thumb { background: #666; border-radius: 3px; }
    .${SCROLL_CLASS}::-webkit-scrollbar-thumb:hover { background: #888; }
  `;
  document.head.appendChild(style);
}

export function GroupsOverlay() {
  const viewer = useViewer();
  const open = useGroupsOverlayOpen();
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [isolatedGroup, setIsolatedGroup] = useState<string | null>(null);
  // Trigger re-render when visibility changes
  const [, setTick] = useState(0);

  // Load groups when overlay opens or model changes
  useEffect(() => {
    if (!open) return;
    const registry = viewer.groups;
    if (!registry) {
      setGroups([]);
      return;
    }
    setGroups(registry.getAll());

    // Apply persisted visibility state
    const saved = loadGroupVisibilitySettings();
    if (saved.isolatedGroup && registry.get(saved.isolatedGroup)) {
      registry.isolate(saved.isolatedGroup);
      setIsolatedGroup(saved.isolatedGroup);
      viewer.markShadowsDirty();
    } else if (saved.hiddenGroups.length > 0) {
      for (const name of saved.hiddenGroups) {
        registry.setVisible(name, false);
      }
      viewer.markShadowsDirty();
    }
    setTick(t => t + 1);
  }, [open, viewer, viewer.groups]);

  // Also refresh groups list when model loads
  useEffect(() => {
    const off = viewer.on('model-loaded', () => {
      if (viewer.groups) {
        setGroups(viewer.groups.getAll());
        // Apply persisted state on new model load
        const saved = loadGroupVisibilitySettings();
        if (saved.isolatedGroup && viewer.groups.get(saved.isolatedGroup)) {
          viewer.groups.isolate(saved.isolatedGroup);
          setIsolatedGroup(saved.isolatedGroup);
          viewer.markShadowsDirty();
        } else if (saved.hiddenGroups.length > 0) {
          for (const name of saved.hiddenGroups) {
            viewer.groups.setVisible(name, false);
          }
          viewer.markShadowsDirty();
        }
        setTick(t => t + 1);
      }
    });
    return off;
  }, [viewer]);

  const persistState = useCallback(() => {
    if (!viewer.groups) return;
    const all = viewer.groups.getAll();
    const hidden = all.filter(g => !g.visible).map(g => g.name);
    const settings: GroupVisibilitySettings = {
      hiddenGroups: hidden,
      isolatedGroup: isolatedGroup,
    };
    saveGroupVisibilitySettings(settings);
  }, [viewer, isolatedGroup]);

  const handleToggle = useCallback((name: string, visible: boolean) => {
    if (!viewer.groups) return;
    viewer.groups.setVisible(name, visible);
    setIsolatedGroup(null);
    viewer.markShadowsDirty();
    setTick(t => t + 1);
    // Persist after state update
    const all = viewer.groups.getAll();
    const hidden = all.filter(g => !g.visible).map(g => g.name);
    saveGroupVisibilitySettings({ hiddenGroups: hidden, isolatedGroup: null });
  }, [viewer]);

  const handleIsolate = useCallback((name: string) => {
    if (!viewer.groups) return;
    viewer.groups.isolate(name);
    setIsolatedGroup(name);
    viewer.markShadowsDirty();
    setTick(t => t + 1);
    saveGroupVisibilitySettings({ hiddenGroups: [], isolatedGroup: name });
  }, [viewer]);

  const handleShowAll = useCallback(() => {
    if (!viewer.groups) return;
    viewer.groups.showAll();
    setIsolatedGroup(null);
    viewer.markShadowsDirty();
    setTick(t => t + 1);
    saveGroupVisibilitySettings({ hiddenGroups: [], isolatedGroup: null });
  }, [viewer]);

  const handleDoubleClick = useCallback((group: GroupInfo) => {
    // Focus camera on all nodes in this group
    if (group.nodes.length > 0) {
      viewer.fitToNodes(group.nodes);
    }
  }, [viewer]);

  const handleClose = useCallback(() => {
    viewer.toggleGroupsOverlay(false);
    persistState();
  }, [viewer, persistState]);

  if (!open) return null;

  const hasGroups = groups.length > 0;
  const anyHidden = groups.some(g => !g.visible);

  return (
    <ChartPanel
      open={open}
      onClose={handleClose}
      title="Groups"
      titleColor="#ab47bc"
      subtitle={hasGroups ? `${groups.length} group${groups.length !== 1 ? 's' : ''}` : undefined}
      defaultWidth={DEFAULT_W}
      defaultHeight={DEFAULT_H}
      defaultPosition={{
        x: window.innerWidth - DEFAULT_W - 16,
        y: window.innerHeight - DEFAULT_H - BOTTOM_MARGIN,
      }}
    >
      {!hasGroups ? (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No groups found in this model
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Show All button */}
          {anyHidden && (
            <>
              <Box sx={{ px: 1.5, py: 0.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleShowAll}
                  fullWidth
                  sx={{ textTransform: 'none', fontSize: 12 }}
                >
                  Show All
                </Button>
              </Box>
              <Divider />
            </>
          )}

          {/* Groups list */}
          <List
            dense
            disablePadding
            className={SCROLL_CLASS}
            sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}
          >
            {groups.map((group) => (
              <ListItem
                key={group.name}
                sx={{
                  py: 0.25,
                  px: 1,
                  opacity: group.visible ? 1 : 0.5,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                }}
                onDoubleClick={() => handleDoubleClick(group)}
              >
                <Switch
                  size="small"
                  checked={group.visible}
                  onChange={(_, checked) => handleToggle(group.name, checked)}
                  sx={{ mr: 0.5 }}
                />
                <ListItemText
                  primary={group.name}
                  secondary={`(${group.nodes.length})`}
                  primaryTypographyProps={{
                    variant: 'body2',
                    noWrap: true,
                    sx: {
                      cursor: 'default',
                      userSelect: 'none',
                      fontWeight: isolatedGroup === group.name ? 700 : 400,
                    },
                  }}
                  secondaryTypographyProps={{
                    variant: 'caption',
                    sx: { color: 'text.disabled', ml: 0.5, display: 'inline' },
                    component: 'span',
                  }}
                  sx={{ minWidth: 0 }}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    size="small"
                    onClick={() => handleIsolate(group.name)}
                    title={`Isolate: show only "${group.name}"`}
                    sx={{
                      p: 0.3,
                      color: isolatedGroup === group.name
                        ? '#ab47bc'
                        : 'rgba(255,255,255,0.3)',
                      '&:hover': { color: '#ab47bc' },
                    }}
                  >
                    {isolatedGroup === group.name
                      ? <Visibility sx={{ fontSize: 16 }} />
                      : <VisibilityOff sx={{ fontSize: 16 }} />}
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </ChartPanel>
  );
}
