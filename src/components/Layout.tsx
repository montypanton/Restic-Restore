import React from 'react';

interface LayoutProps {
    sidebar: React.ReactNode;
    content: React.ReactNode;
}

/**
 * Main layout component with fixed sidebar and flexible content area.
 */
export const Layout: React.FC<LayoutProps> = ({ sidebar, content }) => {
    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            width: '100vw',
            backgroundColor: 'var(--color-bg-white)',
            overflow: 'hidden'
        }}>
            <aside style={{
                width: 'var(--sidebar-width)',
                flexShrink: 0,
                backgroundColor: 'var(--color-bg-white)',
                borderRight: '1px solid var(--color-border)',
                padding: '20px',
                overflowY: 'auto'
            }}>
                {sidebar}
            </aside>

            <main style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--color-bg-white)',
                overflow: 'hidden'
            }}>
                {content}
            </main>
        </div>
    );
};
