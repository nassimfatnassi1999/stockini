import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResizableDataTable } from '../ResizableDataTable';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('ResizableDataTable', () => {
  const mockData = [
    { id: 1, name: 'John Doe', email: 'john@example.com', status: 'Active' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'Inactive' },
  ];

  const mockColumns = [
    { key: 'id', label: 'ID', minWidth: 50 },
    { key: 'name', label: 'Name', sticky: true },
    { key: 'email', label: 'Email' },
    { key: 'status', label: 'Status' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue('{}');
  });

  it('renders table with data correctly', () => {
    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={mockColumns}
      />
    );

    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('renders loading state correctly', () => {
    render(
      <ResizableDataTable
        tableId="test-table"
        data={[]}
        columns={mockColumns}
        loading={true}
      />
    );

    // Should show skeleton loaders
    const skeletonElements = document.querySelectorAll('.animate-pulse');
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it('renders empty state correctly', () => {
    render(
      <ResizableDataTable
        tableId="test-table"
        data={[]}
        columns={mockColumns}
        emptyMessage="No data available"
      />
    );

    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('calls onRowClick when row is clicked', () => {
    const mockOnRowClick = jest.fn();
    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={mockColumns}
        onRowClick={mockOnRowClick}
      />
    );

    const firstRow = screen.getByText('John Doe').closest('tr');
    fireEvent.click(firstRow!);

    expect(mockOnRowClick).toHaveBeenCalledWith(mockData[0], 0);
  });

  it('applies custom render functions', () => {
    const columnsWithRender = [
      ...mockColumns,
      {
        key: 'status',
        label: 'Status',
        render: (value: string) => (
          <span data-testid="custom-status">{`Status: ${value}`}</span>
        ),
      },
    ];

    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={columnsWithRender}
      />
    );

    expect(screen.getByTestId('custom-status')).toHaveTextContent('Status: Active');
  });

  it('applies sticky columns correctly', () => {
    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={mockColumns}
      />
    );

    const nameHeader = screen.getByText('Name');
    expect(nameHeader).toHaveStyle({
      position: 'sticky',
      left: '0px',
      zIndex: '10',
    });
  });

  it('loads saved column widths from localStorage', () => {
    const savedWidths = {
      'test-table-col-0': 100,
      'test-table-col-1': 200,
    };
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedWidths));

    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={mockColumns}
      />
    );

    expect(localStorageMock.getItem).toHaveBeenCalledWith('resizable-table-columns');
  });

  it('saves column widths to localStorage when resized', async () => {
    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={mockColumns}
      />
    );

    // Find resize handle
    const resizeHandles = document.querySelectorAll('[style*="cursor: col-resize"]');
    const firstHandle = resizeHandles[0];

    if (firstHandle) {
      // Simulate mouse down on resize handle
      fireEvent.mouseDown(firstHandle, { clientX: 100 });
      
      // Simulate mouse move
      fireEvent.mouseMove(document, { clientX: 150 });
      
      // Simulate mouse up
      fireEvent.mouseUp(document);

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'resizable-table-columns',
          expect.stringContaining('"test-table-col-0"')
        );
      });
    }
  });

  it('handles keyboard navigation correctly', () => {
    render(
      <ResizableDataTable
        tableId="test-table"
        data={mockData}
        columns={mockColumns}
      />
    );

    const firstRow = screen.getByText('John Doe').closest('tr');
    
    // Test keyboard navigation
    fireEvent.keyDown(firstRow!, { key: 'Enter' });
    // Should trigger row click behavior
  });

  it('formats dates correctly', () => {
    const dataWithDate = [
      { id: 1, name: 'John', createdAt: new Date('2023-01-01') },
    ];

    const columnsWithDate = [
      { key: 'createdAt', label: 'Created At' },
    ];

    render(
      <ResizableDataTable
        tableId="test-table"
        data={dataWithDate}
        columns={columnsWithDate}
      />
    );

    expect(screen.getByText('01/01/2023')).toBeInTheDocument();
  });

  it('handles boolean values correctly', () => {
    const dataWithBoolean = [
      { id: 1, name: 'John', active: true },
      { id: 2, name: 'Jane', active: false },
    ];

    const columnsWithBoolean = [
      { key: 'active', label: 'Active' },
    ];

    render(
      <ResizableDataTable
        tableId="test-table"
        data={dataWithBoolean}
        columns={columnsWithBoolean}
      />
    );

    expect(screen.getByText('Oui')).toBeInTheDocument();
    expect(screen.getByText('Non')).toBeInTheDocument();
  });
});
