import React, { useState } from 'react';

/**
 * Top menu bar (copied from Frontrunner) with Tools dropdown.
 */
export default function TopMenuBar({
  onComputePath,
  onShowIntersectionCurves,
  onManageProfiles,
  onToggleCornerPoints,
  onToggleCenterPoints,
  showCornerPoints,
  showCenterPoints,
  onMeasureDistance,
  onMeasureArea
}) {
  const [openMenu, setOpenMenu] = useState(null);

  const handleMenuClick = (menuName) => {
    setOpenMenu(openMenu === menuName ? null : menuName);
  };

  const closeMenu = () => {
    setOpenMenu(null);
  };

  return (
    <>
      {openMenu && (
        <div
          onClick={closeMenu}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 998
          }}
        />
      )}

      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        backgroundColor: '#1a252f',
        borderBottom: '1px solid #2c3e50',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 999,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        fontFamily: `'Inter', 'Segoe UI', Arial, sans-serif`,
        fontSize: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <MenuButton
            label="Tools"
            isOpen={openMenu === 'tools'}
            onClick={() => handleMenuClick('tools')}
          >
            <MenuItem
              label="Compute Turn Path"
              onSelect={() => {
                onComputePath?.();
                closeMenu();
              }}
            />
            <MenuItem
              label="Measure Distance"
              onSelect={() => {
                onMeasureDistance?.();
                closeMenu();
              }}
            />
            <MenuItem
              label="Measure Area"
              onSelect={() => {
                onMeasureArea?.();
                closeMenu();
              }}
            />
          </MenuButton>
        </div>
      </div>

      <div style={{ height: '40px' }} />
    </>
  );
}

function MenuButton({ label, isOpen, onClick, children }) {
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        style={{
          height: '40px',
          padding: '0 16px',
          backgroundColor: isOpen ? '#2c3e50' : 'transparent',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          fontFamily: `'Inter', 'Segoe UI', Arial, sans-serif`,
          transition: 'background-color 0.15s',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)'
        }}
        onMouseEnter={(e) => {
          if (!isOpen) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        }}
        onMouseLeave={(e) => {
          if (!isOpen) e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {label}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          minWidth: '280px',
          backgroundColor: '#2c3e50',
          border: '1px solid #34495e',
          borderTop: 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 1000,
          fontFamily: `'Inter', 'Segoe UI', Arial, sans-serif`,
          fontSize: '14px'
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, description, checked, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        fontFamily: `'Inter', 'Segoe UI', Arial, sans-serif`
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#34495e';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {checked !== undefined && (
        <div style={{
          width: '16px',
          height: '16px',
          border: '2px solid #3498db',
          borderRadius: '3px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? '#3498db' : 'transparent',
          flexShrink: 0,
          marginTop: '2px'
        }}>
          {checked && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
        </div>
      )}

      {icon && (
        <span style={{ fontSize: '16px', flexShrink: 0 }}>
          {icon}
        </span>
      )}

      <div style={{ flex: 1 }}>
        <div style={{
          color: 'white',
          fontSize: '14px',
          fontWeight: '500',
          marginBottom: description ? '4px' : 0
        }}>
          {label}
        </div>
        {description && (
          <div style={{
            color: '#95a5a6',
            fontSize: '12px',
            lineHeight: '1.3'
          }}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
}


