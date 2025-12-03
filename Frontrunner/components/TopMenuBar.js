import React, { useState } from 'react';

/**
 * Top menu bar with multiple dropdown menus
 * Similar to traditional desktop application menu bars
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
      {/* Backdrop to close menu when clicking outside */}
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

      {/* Menu Bar */}
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
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
      }}>

        {/* Menu Items */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>

          {/* Tools Menu */}
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

      {/* Spacer to push content below menu bar */}
      <div style={{ height: '40px' }} />
    </>
  );
}

/**
 * Individual menu button in the bar
 */
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

      {/* Dropdown Menu */}
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
          zIndex: 1000
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Individual menu item
 */
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
        gap: '12px'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#34495e';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {/* Checkbox for toggleable items */}
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

      {/* Icon */}
      {icon && (
        <span style={{ fontSize: '16px', flexShrink: 0 }}>
          {icon}
        </span>
      )}

      {/* Label and Description */}
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

/**
 * Separator line between menu items
 */
function MenuSeparator() {
  return (
    <div style={{
      height: '1px',
      backgroundColor: '#34495e',
      margin: '4px 0'
    }} />
  );
}

