import { ReactNode } from 'react';
import styles from './Layout.module.css';

interface LayoutProps {
    sidebar: ReactNode;
    content: ReactNode;
}

/**
 * Main layout component with fixed sidebar and flexible content area.
 */
export function Layout({ sidebar, content }: LayoutProps) {
    return (
        <div className={styles.container}>
            <aside className={styles.sidebar}>
                {sidebar}
            </aside>

            <main className={styles.content}>
                {content}
            </main>
        </div>
    );
}
