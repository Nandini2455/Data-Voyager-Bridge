
import React from 'react';
import { Progress } from "@/components/ui/progress";
import { Check, X, Database, AlertTriangle } from "lucide-react";
import { Status } from '@/pages/Index';

interface StatusDisplayProps {
  status: Status;
  recordCount: number | null;
  error: string | null;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({ status, recordCount, error }) => {
  const renderStatusContent = () => {
    switch (status) {
      case 'ingesting':
        return (
          <div className="space-y-4">
            <div className="flex items-center text-databridge-700">
              <Database className="mr-2 h-5 w-5" />
              <span className="font-medium">Ingesting Data</span>
            </div>
            <Progress value={45} className="h-2 w-full" />
            <p className="text-sm text-muted-foreground">
              Processing records... This may take a moment.
            </p>
          </div>
        );
        
      case 'completed':
        return (
          <div className="space-y-4">
            <div className="flex items-center text-green-600">
              <Check className="mr-2 h-6 w-6" />
              <span className="font-medium">Ingestion Complete</span>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h4 className="font-medium text-green-800">Success</h4>
              <p className="text-green-700 mt-1">
                {recordCount?.toLocaleString()} records successfully transferred
              </p>
            </div>
          </div>
        );
        
      case 'error':
        return (
          <div className="space-y-4">
            <div className="flex items-center text-destructive">
              <X className="mr-2 h-6 w-6" />
              <span className="font-medium">Ingestion Failed</span>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-red-500 mr-2" />
                <div>
                  <h4 className="font-medium text-red-800">Error</h4>
                  <p className="text-red-700 mt-1">
                    {error || "An unknown error occurred during data ingestion"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };

  return (
    <div className="py-2">
      {renderStatusContent()}
    </div>
  );
};

export default StatusDisplay;
