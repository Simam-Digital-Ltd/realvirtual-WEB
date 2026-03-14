import { useState, useCallback, useEffect, useRef } from 'react';
import {
  TextField, InputAdornment, Box, Paper, IconButton,
  Popover, Switch, FormControlLabel, Typography, Divider,
  List, ListItemButton, useMediaQuery,
} from '@mui/material';
import { Search, Clear, MoreHoriz, CenterFocusStrong } from '@mui/icons-material';
import { CameraBar } from './CameraBar';
import { useNodeFilter } from '../../hooks/use-node-filter';
import { MOBILE_BREAKPOINT } from '../../hooks/use-mobile-layout';
import { useViewer } from '../../hooks/use-viewer';
import {
  loadSearchSettings, saveSearchSettings,
  getFilterSubscribers, type SearchSettings,
} from './search-settings-store';
import type { NodeSearchResult } from '../engine/rv-node-registry';
import { RvExtrasEditorPlugin } from './rv-extras-editor';

/** Height of the bottom bar area (search + padding) for layout calculations. */
export const BOTTOM_BAR_HEIGHT = 52;

const DEBOUNCE_MS = 250;
const MAX_VISIBLE_RESULTS = 8;

/** Dark-gray outer scrollbar — injected as real CSS for reliable pseudo-element support. */
const SCROLL_CLASS = 'rv-result-scroll';
const scrollStyleId = 'rv-result-scroll-style';
if (typeof document !== 'undefined' && !document.getElementById(scrollStyleId)) {
  const style = document.createElement('style');
  style.id = scrollStyleId;
  style.textContent = `
    .${SCROLL_CLASS} { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.25) transparent; }
    .${SCROLL_CLASS}::-webkit-scrollbar { width: 8px; }
    .${SCROLL_CLASS}::-webkit-scrollbar-track { background: transparent; }
    .${SCROLL_CLASS}::-webkit-scrollbar-thumb { background: #666; border-radius: 4px; }
    .${SCROLL_CLASS}::-webkit-scrollbar-thumb:hover { background: #888; }
    .${SCROLL_CLASS}::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
    .${SCROLL_CLASS}::-webkit-scrollbar-corner { background: #333; }
  `;
  document.head.appendChild(style);
}

export function BottomBar() {
  const viewer = useViewer();
  const { filter, filteredNodes, tooMany, setFilter } = useNodeFilter();
  const [inputValue, setInputValue] = useState('');
  const [settings, setSettings] = useState<SearchSettings>(loadSearchSettings);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useMediaQuery(`(max-width:${MOBILE_BREAKPOINT - 1}px)`);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const programmaticScroll = useRef(false);

  // Settings popover anchor
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  const settingsOpen = Boolean(settingsAnchor);

  // Debounced filter
  const applyFilter = useCallback(
    (val: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setFilter(val), DEBOUNCE_MS);
    },
    [setFilter],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInputValue(val);
      setSelectedIdx(-1);
      applyFilter(val);
    },
    [applyFilter],
  );

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInputValue('');
    setFilter('');
    setMobileSearchOpen(false);
    setSettingsAnchor(null);
  }, [setFilter]);

  /** Compute viewport offset for camera framing when hierarchy/inspector panels are open. */
  const getViewportOffset = useCallback(() => {
    const plugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
    if (!plugin) return undefined;
    const state = plugin.getSnapshot();
    if (!state.panelOpen) return undefined;
    // Hierarchy panel width + inspector (320px) if a node is selected
    const leftPx = state.panelWidth + (state.selectedNodePath ? 320 : 0);
    return leftPx > 0 ? { left: leftPx } : undefined;
  }, [viewer]);

  // Enter → focus camera on highlighted nodes
  const handleFocus = useCallback(() => {
    if (filteredNodes.length > 0 && !tooMany) {
      const nodes = filteredNodes.map(r => r.node);
      viewer.fitToNodes(nodes, getViewportOffset());
    }
  }, [viewer, filteredNodes, tooMany, getViewportOffset]);

  // Click/select result → focus by path, select in hierarchy, close dropdown
  const handleResultClick = useCallback(
    (result: NodeSearchResult) => {
      // Focus camera on the result
      viewer.focusByPath(result.path, getViewportOffset());
      // Select and reveal in hierarchy (opens panel if needed, expands ancestors, scrolls)
      const editorPlugin = viewer.getPlugin<RvExtrasEditorPlugin>('rv-extras-editor');
      if (editorPlugin) editorPlugin.selectAndReveal(result.path);
      // Close search dropdown
      handleClear();
    },
    [viewer, getViewportOffset, handleClear],
  );

  const visibleCount = filteredNodes.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClear();
        setSelectedIdx(-1);
        (e.target as HTMLElement).blur();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx(prev => {
          const next = Math.min(prev + 1, visibleCount - 1);
          programmaticScroll.current = true;
          listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx(prev => {
          const next = Math.max(prev - 1, 0);
          programmaticScroll.current = true;
          listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        if (selectedIdx >= 0 && selectedIdx < filteredNodes.length) {
          handleResultClick(filteredNodes[selectedIdx]);
        } else {
          handleFocus();
        }
      }
    },
    [handleClear, handleFocus, handleResultClick, filteredNodes, selectedIdx, visibleCount],
  );

  // Cleanup debounce on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // ─── Settings handlers ──────────────────────────────────────────

  const updateSettings = useCallback((patch: Partial<SearchSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSearchSettings(next);
      return next;
    });
  }, []);

  // Re-trigger filter when settings change (highlight or type toggles)
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  useEffect(() => {
    if (filter) setFilter(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.highlightEnabled, settings.nodesEnabled, settings.disabledTypes.join(',')]);

  const toggleType = useCallback((typeId: string) => {
    setSettings(prev => {
      const disabled = prev.disabledTypes.includes(typeId)
        ? prev.disabledTypes.filter(t => t !== typeId)
        : [...prev.disabledTypes, typeId];
      const next = { ...prev, disabledTypes: disabled };
      saveSearchSettings(next);
      return next;
    });
  }, []);

  const subscribers = getFilterSubscribers();
  const showResults = filter && !tooMany && filteredNodes.length > 0;
  const resultCount = filteredNodes.length;

  // Count badge text
  const badgeText = !filter
    ? null
    : tooMany
      ? `${resultCount} — type more`
      : `${resultCount} found`;

  return (
    <>
    {/* Mobile: search toggle FAB */}
    {isMobile && (
      <IconButton
        onClick={() => mobileSearchOpen ? handleClear() : setMobileSearchOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
          right: 12,
          zIndex: 1201,
          bgcolor: 'background.paper',
          boxShadow: 4,
          width: 40,
          height: 40,
          pointerEvents: 'auto',
        }}
      >
        {mobileSearchOpen ? <Clear /> : <Search />}
      </IconButton>
    )}
    <Box
      sx={{
        position: 'fixed',
        bottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom, 0px))' : 8,
        left: 0,
        right: 0,
        zIndex: 1200,
        pointerEvents: 'none',
        ...(isMobile && {
          transform: mobileSearchOpen ? 'translateY(0)' : 'translateY(calc(100% + 80px))',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }),
      }}
    >
      {/* Centered search bar + results */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Result dropdown (above search bar) */}
        {showResults && (
          <Paper
            elevation={4}
            className={SCROLL_CLASS}
            onScroll={() => { if (programmaticScroll.current) programmaticScroll.current = false; else if (selectedIdx >= 0) setSelectedIdx(-1); }}
            sx={{
              width: { xs: 'calc(100vw - 24px)', sm: 388 },
              maxHeight: 320,
              mb: 0.5,
              borderRadius: 2,
              pointerEvents: 'auto',
              overflow: 'auto',
            }}
          >
            <List dense disablePadding ref={listRef}>
              {filteredNodes.map((r, i) => {
                const name = r.path.split('/').pop() ?? r.path;
                const typeLabel = r.types.length > 0 ? r.types[0] : '';
                const isSelected = i === selectedIdx;
                return (
                  <ListItemButton
                    key={r.path}
                    selected={isSelected}
                    onClick={() => handleResultClick(r)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    onMouseMove={() => { if (selectedIdx !== i) setSelectedIdx(i); }}
                    title={r.path}
                    sx={{ py: 0.25, px: 1.5, minHeight: 0 }}
                  >
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>{name}</Typography>
                    {typeLabel && (
                      <Typography variant="caption" noWrap sx={{ ml: 1, opacity: 0.45, fontSize: '0.65rem' }}>
                        {typeLabel}
                      </Typography>
                    )}
                  </ListItemButton>
                );
              })}
            </List>
          </Paper>
        )}

        {/* Search bar */}
        <Paper
          elevation={4}
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            pointerEvents: 'auto',
            width: { xs: 'calc(100vw - 24px)', sm: 380 },
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <TextField
            placeholder="Search drives, sensors, objects..."
            size="small"
            fullWidth
            variant="standard"
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            slotProps={{
              input: {
                disableUnderline: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: filter ? 'primary.main' : 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    {badgeText && (
                      <Typography variant="caption" sx={{ color: tooMany ? 'text.disabled' : 'primary.main', mr: 0.5, whiteSpace: 'nowrap' }}>
                        {badgeText}
                      </Typography>
                    )}
                    {/* Focus button (touch alternative to Enter) */}
                    {filter && !tooMany && filteredNodes.length > 0 && (
                      <IconButton size="small" onClick={handleFocus} sx={{ p: 0.25 }} title="Focus camera (Enter)">
                        <CenterFocusStrong sx={{ fontSize: 16, color: 'primary.main' }} />
                      </IconButton>
                    )}
                    {filter && (
                      <IconButton size="small" onClick={handleClear} sx={{ p: 0.25 }}>
                        <Clear sx={{ fontSize: 16, color: 'text.secondary' }} />
                      </IconButton>
                    )}
                  </InputAdornment>
                ),
              },
            }}
          />
          <IconButton
            size="small"
            onClick={(e) => setSettingsAnchor(e.currentTarget)}
            sx={{ ml: 0.5, p: 0.25 }}
          >
            <MoreHoriz sx={{ fontSize: 18, color: 'text.secondary' }} />
          </IconButton>
        </Paper>
      </Box>

      {/* Camera presets + HMI toggle — bottom right */}
      <Paper
        elevation={4}
        sx={{
          position: 'absolute',
          bottom: 0,
          right: 8,
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderRadius: 2,
          pointerEvents: 'auto',
        }}
      >
        <CameraBar />
      </Paper>

      {/* Search settings popover */}
      <Popover
        open={settingsOpen}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{ paper: { sx: { p: 2, minWidth: 220, pointerEvents: 'auto' } } }}
      >
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Search Settings</Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.highlightEnabled}
              onChange={(_, checked) => updateSettings({ highlightEnabled: checked })}
            />
          }
          label={<Typography variant="body2">Highlight in 3D</Typography>}
          sx={{ ml: 0 }}
        />
        <Divider sx={{ my: 1 }} />
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
          Include:
        </Typography>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.nodesEnabled}
              onChange={(_, checked) => updateSettings({ nodesEnabled: checked })}
            />
          }
          label={<Typography variant="body2">All Objects</Typography>}
          sx={{ ml: 0, display: 'flex' }}
        />
        {subscribers.map((sub) => (
          <FormControlLabel
            key={sub.id}
            control={
              <Switch
                size="small"
                checked={!settings.disabledTypes.includes(sub.id)}
                onChange={() => toggleType(sub.id)}
              />
            }
            label={<Typography variant="body2">{sub.label}</Typography>}
            sx={{ ml: 0, display: 'flex' }}
          />
        ))}
      </Popover>
    </Box>
    </>
  );
}
