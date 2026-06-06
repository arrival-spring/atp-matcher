import { h } from 'preact';

export function Header({ title, subtitle }) {
    return (
        <header class="mb-12 mt-4">
            <h1 class="text-5xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-teal-400">
                {title}
            </h1>
            {subtitle && <p class="text-xl text-gray-400">{subtitle}</p>}
        </header>
    );
}

export function Footer({ atpDate, osmDate }) {
    return (
        <footer class="max-w-7xl mx-auto mt-12 pt-8 border-t border-gray-800 text-gray-500 text-sm">
            <div class="flex flex-wrap gap-x-8 gap-y-2">
                <div><strong>ATP Data:</strong> {atpDate}</div>
                <div><strong>OSM Data:</strong> {osmDate}</div>
            </div>
        </footer>
    );
}

export function Layout({ children, atpDate, osmDate }) {
    return (
        <div class="max-w-7xl mx-auto">
            {children}
            <Footer atpDate={atpDate} osmDate={osmDate} />
        </div>
    );
}
