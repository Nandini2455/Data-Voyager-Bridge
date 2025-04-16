
import React from 'react';
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Column } from '@/pages/Index';

interface ColumnSelectorProps {
  columns: Column[];
  onToggleColumn: (index: number) => void;
  onToggleAll: (selected: boolean) => void;
}

const ColumnSelector: React.FC<ColumnSelectorProps> = ({ columns, onToggleColumn, onToggleAll }) => {
  const allSelected = columns.every(col => col.selected);
  const someSelected = columns.some(col => col.selected) && !allSelected;
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="select-all" 
            checked={allSelected}
            onCheckedChange={(checked) => onToggleAll(!!checked)} 
          />
          <label htmlFor="select-all" className="text-sm font-medium">
            Select All Columns
          </label>
        </div>
        <div className="space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onToggleAll(true)}
          >
            Select All
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onToggleAll(false)}
          >
            Deselect All
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {columns.map((column, index) => (
          <div 
            key={column.name}
            className="flex items-center space-x-2 border rounded-md p-3 hover:bg-muted/30 transition-colors"
          >
            <Checkbox 
              id={`column-${index}`}
              checked={column.selected}
              onCheckedChange={() => onToggleColumn(index)}
            />
            <div>
              <label 
                htmlFor={`column-${index}`}
                className="text-sm font-medium cursor-pointer"
              >
                {column.name}
              </label>
              <p className="text-xs text-muted-foreground">{column.type}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ColumnSelector;
