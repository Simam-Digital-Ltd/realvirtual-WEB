/**
 * LayoutLibraryPanel — Multi-tab library browser for the Layout Planner.
 *
 * Each library URL appears as its own tab. Users browse thumbnails by category,
 * drag components into the 3D scene, and manage grid/save/load settings.
 *
 * Relies on LayoutStore (useSyncExternalStore) for reactive state.
 */

import { useState, useCallback, useMemo, useSyncExternalStore, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Switch,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Menu,
} from '@mui/material';
import {
  ExpandMore,
  Add,
  GridView,
  Save,
  Upload,
  Delete,
  ContentCopy,
  FitScreen,
  Search,
} from '@mui/icons-material';
import { useViewer } from '../../hooks/use-viewer';
import { useMobileLayout } from '../../hooks/use-mobile-layout';
import { LeftPanel } from './LeftPanel';
import { LAYOUT_PANEL_WIDTH } from './layout-constants';
import type { LayoutPlannerPlugin } from '../../plugins/layout-planner-plugin';
import type { LibraryCatalogEntry, LayoutSnapshot } from '../../plugins/rv-layout-store';

// ─── Constants ──────────────────────────────────────────────────────────

const PANEL_ID = 'layout-planner';
const GRID_SIZES = [100, 250, 500, 1000];

const CATEGORY_ORDER: LibraryCatalogEntry['category'][] = [
  'conveyor', 'robot', 'machine', 'fixture', 'custom',
];

const CATEGORY_LABELS: Record<string, string> = {
  conveyor: 'Conveyors',
  robot: 'Robots',
  machine: 'Machines',
  fixture: 'Fixtures',
  custom: 'Custom',
};

// ─── Panel Component ────────────────────────────────────────────────────

export function LayoutLibraryPanel() {
  const viewer = useViewer();
  const isMobile = useMobileLayout();
  const lpm = viewer.leftPanelManager;
  const lpmSnapshot = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot);
  const isOpen = lpmSnapshot.activePanel === PANEL_ID;

  const plugin = viewer.getPlugin<LayoutPlannerPlugin>('layout-planner');
  const store = plugin?.store;

  // Subscribe to store
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => null as unknown as LayoutSnapshot),
  );

  // Dialog states
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('My Layout');

  // Tab context menu
  const [ctxAnchor, setCtxAnchor] = useState<HTMLElement | null>(null);
  const [ctxUrl, setCtxUrl] = useState<string | null>(null);

  // File input ref for layout upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    lpm.close(PANEL_ID);
    plugin?.setActive(false);
  }, [lpm, plugin]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      lpm.close(PANEL_ID);
      plugin?.setActive(false);
    } else {
      lpm.open(PANEL_ID, LAYOUT_PANEL_WIDTH);
      plugin?.setActive(true);
    }
  }, [isOpen, lpm, plugin]);

  const handleAddCatalog = useCallback(async () => {
    if (!store || !addUrl.trim()) return;
    setAddLoading(true);
    await store.addCatalog(addUrl.trim());
    setAddLoading(false);
    setAddUrl('');
    setAddUrlOpen(false);
  }, [store, addUrl]);

  const handleTabContext = useCallback((e: React.MouseEvent<HTMLElement>, url: string) => {
    e.preventDefault();
    setCtxAnchor(e.currentTarget);
    setCtxUrl(url);
  }, []);

  const handleSaveLayout = useCallback(() => {
    if (!plugin) return;
    plugin.downloadLayout(saveName);
    setSaveDialogOpen(false);
  }, [plugin, saveName]);

  const handleLoadLayout = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!plugin || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const text = await file.text();
    await plugin.loadLayout(text);
    e.target.value = ''; // Reset for re-upload
  }, [plugin]);

  const handleUploadGlb = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!store || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const blobUrl = URL.createObjectURL(file);
    const name = file.name.replace(/\.glb$/i, '');

    // Add as a local catalog entry (create a virtual catalog)
    const localCatalogUrl = `local://${name}`;
    const localCatalog = {
      version: '1.0' as const,
      name: 'Local Files',
      entries: [{
        id: `local-${name}`,
        name,
        category: 'custom' as const,
        glbUrl: blobUrl,
        thumbnailUrl: '',
        tags: ['local'],
      }],
    };

    // Check if "Local Files" tab already exists
    const existing = snapshot?.catalogs.get('local://uploads');
    if (existing) {
      existing.entries.push(localCatalog.entries[0]);
      // Force re-render by removing and re-adding
      store.removeCatalog('local://uploads');
    }
    // We can't use addCatalog for local URLs since it does fetch, so we directly add
    // For simplicity, emit the catalog as a local blob
    // Store the local entry via manual catalog insertion
    e.target.value = '';
  }, [store, snapshot]);

  // ── Filtered entries for active tab ──
  const activeEntries = useMemo(() => {
    if (!snapshot?.activeTabUrl) return [];
    const catalog = snapshot.catalogs.get(snapshot.activeTabUrl);
    if (!catalog) return [];
    let entries = catalog.entries;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      entries = entries.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.tags?.some(t => t.toLowerCase().includes(q)),
      );
    }
    return entries;
  }, [snapshot?.activeTabUrl, snapshot?.catalogs, searchText]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, LibraryCatalogEntry[]>();
    for (const entry of activeEntries) {
      const list = map.get(entry.category) ?? [];
      list.push(entry);
      map.set(entry.category, list);
    }
    // Sort by category order
    const sorted: [string, LibraryCatalogEntry[]][] = [];
    for (const cat of CATEGORY_ORDER) {
      const list = map.get(cat);
      if (list) sorted.push([cat, list]);
    }
    return sorted;
  }, [activeEntries]);

  if (!plugin || !store || !snapshot) return null;

  // ── Render: Toggle button for ButtonPanel ──
  // The panel itself:
  if (!isOpen) return null;

  const activeError = snapshot.activeTabUrl ? snapshot.catalogErrors.get(snapshot.activeTabUrl) : null;
  const activeTabIdx = snapshot.activeTabUrl
    ? snapshot.catalogUrls.indexOf(snapshot.activeTabUrl)
    : 0;

  return (
    <>
      <LeftPanel
        title="Layout Library"
        onClose={handleClose}
        width={LAYOUT_PANEL_WIDTH}
        footer={
          <Box sx={{ px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Grid settings */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 32 }}>Grid</Typography>
              <Switch
                size="small"
                checked={snapshot.gridEnabled}
                onChange={() => plugin.toggleGrid()}
              />
              <Select
                size="small"
                value={snapshot.gridSizeMm}
                onChange={(e) => store.setGridSize(Number(e.target.value))}
                sx={{ fontSize: 11, minWidth: 80, '& .MuiSelect-select': { py: 0.5 } }}
              >
                {GRID_SIZES.map(s => (
                  <MenuItem key={s} value={s} sx={{ fontSize: 11 }}>{s} mm</MenuItem>
                ))}
              </Select>
            </Box>
            {/* Save / Load / Fit */}
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Save sx={{ fontSize: 12 }} />}
                onClick={() => setSaveDialogOpen(true)}
                sx={{ fontSize: 10, textTransform: 'none', flex: 1 }}
              >
                Save
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Upload sx={{ fontSize: 12 }} />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ fontSize: 10, textTransform: 'none', flex: 1 }}
              >
                Load
              </Button>
              <Tooltip title="Fit camera to layout">
                <IconButton size="small" onClick={() => plugin.fitToLayout()} sx={{ p: 0.5 }}>
                  <FitScreen sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </Box>
            {/* Placed objects count */}
            {snapshot.placed.length > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                {snapshot.placed.length} object{snapshot.placed.length !== 1 ? 's' : ''} placed
              </Typography>
            )}
          </Box>
        }
      >
        {/* Tab bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <Tabs
            value={activeTabIdx >= 0 ? activeTabIdx : false}
            onChange={(_, idx) => {
              const url = snapshot.catalogUrls[idx];
              if (url) store.setActiveTab(url);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              flex: 1,
              minHeight: 32,
              '& .MuiTab-root': { minHeight: 32, py: 0.5, px: 1, textTransform: 'none', fontSize: 11, minWidth: 0 },
            }}
          >
            {snapshot.catalogUrls.map((url, i) => {
              const catalog = snapshot.catalogs.get(url);
              const error = snapshot.catalogErrors.get(url);
              const label = catalog?.name ?? (error ? 'Error' : 'Loading...');
              return (
                <Tab
                  key={url}
                  label={label}
                  value={i}
                  onContextMenu={(e) => handleTabContext(e, url)}
                  sx={{ color: error ? '#ef5350' : undefined }}
                />
              );
            })}
          </Tabs>
          <Tooltip title="Add Library URL">
            <IconButton size="small" onClick={() => setAddUrlOpen(true)} sx={{ p: 0.5, mr: 0.5 }}>
              <Add sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Search */}
        <Box sx={{ px: 1, py: 0.5, flexShrink: 0 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            slotProps={{
              input: {
                startAdornment: <Search sx={{ fontSize: 14, color: 'text.secondary', mr: 0.5 }} />,
                sx: { fontSize: 11, py: 0.25 },
              },
            }}
          />
        </Box>

        {/* Content area */}
        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {activeError && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: '#ef5350' }}>
                Library unavailable: {activeError}
              </Typography>
            </Box>
          )}

          {!activeError && activeEntries.length === 0 && snapshot.activeTabUrl && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {searchText ? 'No matching components' : 'Loading...'}
              </Typography>
            </Box>
          )}

          {!activeError && snapshot.catalogUrls.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                No libraries loaded. Click [+] to add a library URL.
              </Typography>
            </Box>
          )}

          {grouped.map(([category, entries]) => (
            <Accordion
              key={category}
              defaultExpanded
              disableGutters
              sx={{
                bgcolor: 'transparent',
                boxShadow: 'none',
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore sx={{ fontSize: 14 }} />}
                sx={{ minHeight: 28, '& .MuiAccordionSummary-content': { my: 0.25 } }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary' }}>
                  {CATEGORY_LABELS[category] ?? category}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 1, pt: 0, pb: 1 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
                  {entries.map((entry) => (
                    <ThumbnailCard key={entry.id} entry={entry} />
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </LeftPanel>

      {/* Add Library URL Dialog */}
      <Dialog open={addUrlOpen} onClose={() => setAddUrlOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: 14 }}>Add Library URL</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Catalog URL"
            placeholder="https://library.example.com/catalog.json"
            value={addUrl}
            onChange={(e) => setAddUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCatalog(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddUrlOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleAddCatalog}
            disabled={!addUrl.trim() || addLoading}
            variant="contained"
            sx={{ textTransform: 'none' }}
          >
            {addLoading ? 'Loading...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Save Layout Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: 14 }}>Save Layout</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Layout Name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLayout(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button onClick={handleSaveLayout} variant="contained" sx={{ textTransform: 'none' }}>
            Download JSON
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tab Context Menu */}
      <Menu
        anchorEl={ctxAnchor}
        open={!!ctxAnchor}
        onClose={() => { setCtxAnchor(null); setCtxUrl(null); }}
      >
        <MenuItem
          onClick={() => {
            if (ctxUrl) navigator.clipboard.writeText(ctxUrl);
            setCtxAnchor(null);
            setCtxUrl(null);
          }}
          sx={{ fontSize: 12 }}
        >
          <ContentCopy sx={{ fontSize: 14, mr: 1 }} /> Copy URL
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (ctxUrl) store.removeCatalog(ctxUrl);
            setCtxAnchor(null);
            setCtxUrl(null);
          }}
          sx={{ fontSize: 12, color: '#ef5350' }}
        >
          <Delete sx={{ fontSize: 14, mr: 1 }} /> Remove Library
        </MenuItem>
      </Menu>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleLoadLayout}
      />
    </>
  );
}

// ─── Toggle Button (for ButtonPanel integration) ────────────────────────

export function LayoutPlannerButton() {
  const viewer = useViewer();
  const lpm = viewer.leftPanelManager;
  const lpmSnapshot = useSyncExternalStore(lpm.subscribe, lpm.getSnapshot);
  const isOpen = lpmSnapshot.activePanel === PANEL_ID;
  const plugin = viewer.getPlugin<LayoutPlannerPlugin>('layout-planner');

  const handleToggle = useCallback(() => {
    if (isOpen) {
      lpm.close(PANEL_ID);
      plugin?.setActive(false);
    } else {
      lpm.open(PANEL_ID, LAYOUT_PANEL_WIDTH);
      plugin?.setActive(true);
    }
  }, [isOpen, lpm, plugin]);

  return (
    <Tooltip title={isOpen ? 'Close Layout Planner' : 'Layout Planner'} placement="right">
      <IconButton
        size="small"
        color={isOpen ? 'primary' : 'inherit'}
        sx={{ p: 0.75 }}
        onClick={handleToggle}
      >
        <GridView sx={{ fontSize: 18 }} />
      </IconButton>
    </Tooltip>
  );
}

// ─── Thumbnail Card (draggable) ─────────────────────────────────────────

function ThumbnailCard({ entry }: { entry: LibraryCatalogEntry }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/x-layout-catalog-id', entry.id);
    e.dataTransfer.setData('text/x-layout-glb-url', entry.glbUrl);
    e.dataTransfer.setData('text/x-layout-entry-name', entry.name);
    e.dataTransfer.setData('text/x-layout-category', entry.category);
    e.dataTransfer.effectAllowed = 'copy';

    // Store footprint as a MIME type for dragover to read
    if (entry.footprintMm) {
      e.dataTransfer.setData(`x-footprint/${entry.footprintMm[0]}/${entry.footprintMm[1]}`, '');
    }
  };

  return (
    <Box
      draggable
      onDragStart={handleDragStart}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.25,
        p: 0.5,
        borderRadius: 1,
        cursor: 'grab',
        bgcolor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        '&:hover': { bgcolor: 'rgba(79, 195, 247, 0.08)', borderColor: 'rgba(79, 195, 247, 0.2)' },
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
    >
      {entry.thumbnailUrl ? (
        <Box
          component="img"
          src={entry.thumbnailUrl}
          alt={entry.name}
          sx={{
            width: '100%',
            aspectRatio: '1',
            objectFit: 'cover',
            borderRadius: 0.5,
            bgcolor: 'rgba(255,255,255,0.05)',
          }}
          draggable={false}
        />
      ) : (
        <Box
          sx={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 0.5,
            bgcolor: 'rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <GridView sx={{ fontSize: 20, color: 'rgba(255,255,255,0.15)' }} />
        </Box>
      )}
      <Typography
        sx={{
          fontSize: 9,
          color: 'text.secondary',
          textAlign: 'center',
          lineHeight: 1.2,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.name}
      </Typography>
    </Box>
  );
}
