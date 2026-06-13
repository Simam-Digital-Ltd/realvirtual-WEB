// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Breadcrumbs, Link, Typography, Chip, IconButton } from '@mui/material';
import { 
  Public as WorldIcon, 
  Factory as FactoryIcon, 
  PrecisionManufacturing as RobotIcon,
  ChevronRight,
  Map as MapIcon
} from '@mui/icons-material';
import type { UISlotProps } from '../core/rv-ui-plugin';
import type { SiteManagerPlugin, Site, SiteAsset } from '../plugins/site-manager-plugin';

/**
 * BreadcrumbUI Component
 * Displays the current navigation context: World > Site > Asset
 */
export const BreadcrumbUI: React.FC<UISlotProps> = ({ viewer }) => {
  const plugin = useMemo(() => viewer.getPlugin('site-manager') as SiteManagerPlugin, [viewer]);
  const [currentSite, setCurrentSite] = useState<Site | null>(plugin?.currentSite || null);
  const [currentAsset, setCurrentAsset] = useState<SiteAsset | null>(plugin?.currentAsset || null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const update = () => {
      setCurrentSite(plugin?.currentSite || null);
      setCurrentAsset(plugin?.currentAsset || null);
      setTick(t => t + 1);
    };

    viewer.on('breadcrumb-updated' as any, update);
    viewer.on('sites-updated' as any, update);
    return () => {
      viewer.off('breadcrumb-updated' as any, update);
      viewer.off('sites-updated' as any, update);
    };
  }, [viewer, plugin]);

  const handleWorldClick = (e: React.MouseEvent) => {
    e.preventDefault();
    plugin?.resetToWorld();
    // Toggle map if available
    const mapPlugin = viewer.getPlugin('osm-map') as any;
    if (mapPlugin && !mapPlugin._active) mapPlugin.toggle();
  };

  const handleSiteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (currentSite) plugin?.selectSite(currentSite);
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 2,
      backdropFilter: 'blur(10px)',
      bgcolor: 'rgba(15, 23, 42, 0.4)',
      px: 2,
      py: 0.5,
      borderRadius: '50px',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
    }}>
      <Breadcrumbs 
        separator={<ChevronRight fontSize="small" sx={{ color: 'rgba(255,255,255,0.3)' }} />}
        aria-label="breadcrumb"
      >
        {/* WORLD LEVEL */}
        <Link
          underline="hover"
          sx={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
          onClick={handleWorldClick}
        >
          <WorldIcon sx={{ mr: 0.5 }} fontSize="inherit" />
          World
        </Link>

        {/* SITE LEVEL */}
        {currentSite ? (
          <Link
            underline="hover"
            sx={{ display: 'flex', alignItems: 'center', color: '#20a1b1', cursor: 'pointer' }}
            onClick={handleSiteClick}
          >
            <FactoryIcon sx={{ mr: 0.5 }} fontSize="inherit" />
            {currentSite.name}
          </Link>
        ) : (
          <Typography sx={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.3)' }}>
             Select Site
          </Typography>
        )}

        {/* ASSET LEVEL */}
        {currentAsset && (
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Chip 
              icon={<RobotIcon fontSize="small" style={{ color: '#fff' }} />} 
              label={currentAsset.name} 
              size="small"
              onDelete={() => plugin?.selectAsset(currentAsset)} // Re-focus
              deleteIcon={<IconButton size="small"><MapIcon fontSize="small" /></IconButton>}
              sx={{ 
                bgcolor: 'rgba(32, 161, 177, 0.8)', 
                color: '#fff',
                '& .MuiChip-label': { fontWeight: 600 }
              }} 
            />
          </Box>
        )}
      </Breadcrumbs>
    </Box>
  );
};
