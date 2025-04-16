import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Database, FileText, RefreshCw } from "lucide-react";
import SourceConfig from '@/components/SourceConfig';
import TargetConfig from '@/components/TargetConfig';
import ColumnSelector from '@/components/ColumnSelector';
import StatusDisplay from '@/components/StatusDisplay';
import { useToast } from '@/hooks/use-toast';

// Types for our application
export type ConnectionType = 'clickhouse' | 'flatfile';
export type Direction = 'source' | 'target';
export type Status = 'idle' | 'connecting' | 'fetching' | 'ingesting' | 'completed' | 'error';

export interface ClickHouseConfig {
  host: string;
  port: string;
  database: string;
  user: string;
  jwtToken: string;
  password?: string;
  table?: string;
}

export interface FlatFileConfig {
  filename: string;
  delimiter: string;
}

export interface Column {
  name: string;
  type: string;
  selected: boolean;
}

const Index = () => {
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState<ConnectionType>('clickhouse');
  const [targetType, setTargetType] = useState<ConnectionType>('flatfile');
  const [sourceConfig, setSourceConfig] = useState<ClickHouseConfig | FlatFileConfig>({
    host: '',
    port: '8123',
    database: '',
    user: '',
    jwtToken: '',
    password: '',
  });
  const [targetConfig, setTargetConfig] = useState<ClickHouseConfig | FlatFileConfig>({
    filename: '',
    delimiter: ',',
    host: '',
    port: '8123',
    database: '',
    user: '',
    jwtToken: '',
    password: '',
    table: '',
  });
  const [columns, setColumns] = useState<Column[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Function to handle changes in source configuration
  const handleSourceConfigChange = (config: ClickHouseConfig | FlatFileConfig) => {
    setSourceConfig(config);
  };

  // Function to handle changes in target configuration
  const handleTargetConfigChange = (config: ClickHouseConfig | FlatFileConfig) => {
    setTargetConfig(config);
  };

  // Function to toggle column selection
  const toggleColumnSelection = (index: number) => {
    const updatedColumns = [...columns];
    updatedColumns[index].selected = !updatedColumns[index].selected;
    setColumns(updatedColumns);
  };

  // Function to select/deselect all columns
  const toggleAllColumns = (selected: boolean) => {
    const updatedColumns = columns.map(column => ({
      ...column,
      selected
    }));
    setColumns(updatedColumns);
  };

  // Function to connect to the source and fetch schema
  const connectToSource = async () => {
    setStatus('connecting');
    setError(null);
    setTables([]); // Clear previous tables
    setColumns([]); // Clear previous columns
    setSelectedTable('');
    setCurrentStep(1); // Stay on step 1 until connection succeeds

    const payload = {
      source_type: sourceType,
      ...(sourceType === 'clickhouse'
        ? { // Map frontend CH state to backend expected keys
            host: (sourceConfig as ClickHouseConfig).host,
            port: (sourceConfig as ClickHouseConfig).port,
            database: (sourceConfig as ClickHouseConfig).database,
            user: (sourceConfig as ClickHouseConfig).user,
            jwt: (sourceConfig as ClickHouseConfig).jwtToken, // Map jwtToken to jwt
            password: (sourceConfig as ClickHouseConfig).password // Include password
          }
        : { // Map frontend FF state to backend expected keys
            file_path: (sourceConfig as FlatFileConfig).filename, // Map filename to file_path
            delimiter: (sourceConfig as FlatFileConfig).delimiter,
            has_header: true // Assuming header for column fetch, adjust if needed
          })
    };

    try {
      let endpoint = '';
      if (sourceType === 'clickhouse') {
        endpoint = '/api/get_tables'; // Endpoint to get tables for ClickHouse
      } else {
        endpoint = '/api/get_columns'; // Endpoint to get columns for Flat File
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      if (sourceType === 'clickhouse') {
        if (data.tables) {
          setTables(data.tables);
          setStatus('idle');
          setCurrentStep(2); // Move to table selection step
          toast({
            title: "Connection Successful",
            description: "Fetched ClickHouse tables. Please select one.",
          });
        } else {
           throw new Error("No tables found or invalid response from server.");
        }
      } else { // Flat File
        if (data.columns) {
          setColumns(data.columns); // Backend now returns the correct structure
          setCurrentStep(3); // Move to column selection step
          setStatus('idle');
           toast({
            title: "Connection Successful",
            description: "Loaded columns from flat file header.",
          });
        } else {
           throw new Error("No columns found or invalid response from server.");
        }
      }
    } catch (err: any) {
      setStatus('error');
      const errorMsg = err.message || 'Failed to connect to source or fetch schema';
      setError(errorMsg);
      toast({
        title: "Connection Failed",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  // Function to load columns from a selected table (ClickHouse only)
  const loadColumns = async () => {
    if (sourceType !== 'clickhouse' || !selectedTable) {
      toast({
        title: "Invalid Action",
        description: "Please select a ClickHouse table first.",
        variant: "destructive",
      });
      return;
    }

    setStatus('fetching');
    setError(null);
    setColumns([]); // Clear previous columns

    const payload = {
        source_type: 'clickhouse',
        table: selectedTable,
        host: (sourceConfig as ClickHouseConfig).host,
        port: (sourceConfig as ClickHouseConfig).port,
        database: (sourceConfig as ClickHouseConfig).database,
        user: (sourceConfig as ClickHouseConfig).user,
        jwt: (sourceConfig as ClickHouseConfig).jwtToken, // Map jwtToken to jwt
        password: (sourceConfig as ClickHouseConfig).password // Include password
      };

    try {
      const response = await fetch('/api/get_columns', { // Use the get_columns endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      if (data.columns && data.columns.length > 0) {
        setColumns(data.columns); // Backend provides name, type, selected
        setStatus('idle');
        setCurrentStep(3); // Move to column selection
        toast({
          title: "Columns Loaded",
          description: `Loaded ${data.columns.length} columns from ${selectedTable}`,
        });
      } else {
         throw new Error("No columns found for the selected table or invalid server response.");
      }

    } catch (err: any) {
      setStatus('error');
      const errorMsg = err.message || 'Failed to load columns';
      setError(errorMsg);
      toast({
        title: "Failed to Load Columns",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  // Function to start the data ingestion process
  const startIngestion = async () => {
    const selectedColumnNames = columns
        .filter(col => col.selected)
        .map(col => col.name);

    if (selectedColumnNames.length === 0) {
      toast({
        title: "No Columns Selected",
        description: "Please select at least one column for ingestion",
        variant: "destructive",
      });
      return;
    }

    setStatus('ingesting');
    setError(null);
    setRecordCount(null);

    // --- Construct Payload based on flow direction ---
    let payload: any = {
      columns: selectedColumnNames,
    };

    if (sourceType === 'clickhouse' && targetType === 'flatfile') {
      payload = {
        ...payload,
        flow_type: 'ch_to_ff',
        // Source ClickHouse config
        host: (sourceConfig as ClickHouseConfig).host,
        port: (sourceConfig as ClickHouseConfig).port,
        database: (sourceConfig as ClickHouseConfig).database,
        user: (sourceConfig as ClickHouseConfig).user,
        jwt: (sourceConfig as ClickHouseConfig).jwtToken,
        password: (sourceConfig as ClickHouseConfig).password, // Include password
        source_table: selectedTable,
        // Target Flat File config
        target_file: (targetConfig as FlatFileConfig).filename, // Map filename to target_file
        target_delimiter: (targetConfig as FlatFileConfig).delimiter,
        include_header: true // TODO: Make this configurable in TargetConfig UI
      };
    } else if (sourceType === 'flatfile' && targetType === 'clickhouse') {
       payload = {
         ...payload,
         flow_type: 'ff_to_ch',
         // Source Flat File config
         source_file: (sourceConfig as FlatFileConfig).filename, // Map filename to source_file
         source_delimiter: (sourceConfig as FlatFileConfig).delimiter,
         source_has_header: true, // Assuming header if columns were selectable
         // Target ClickHouse config (uses targetConfig state)
         host: (targetConfig as ClickHouseConfig).host,
         port: (targetConfig as ClickHouseConfig).port,
         database: (targetConfig as ClickHouseConfig).database,
         user: (targetConfig as ClickHouseConfig).user,
         jwt: (targetConfig as ClickHouseConfig).jwtToken,
         password: (targetConfig as ClickHouseConfig).password, // Include password from targetConfig
         target_table: (targetConfig as ClickHouseConfig).table,
         target_create: true // TODO: Make this configurable in TargetConfig UI
       };
    } else {
      toast({ title: "Invalid Flow", description: "Source/Target combination not supported.", variant: "destructive" });
      setStatus('error');
      setError('Invalid flow configuration');
      return;
    }
    // --- End Payload Construction ---

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      // Handle success
      const count = data.records_processed;
      setRecordCount(count);
      setStatus('completed');
      toast({
        title: "Ingestion Complete",
        description: `Successfully processed ${count?.toLocaleString() ?? '0'} records`,
      });

    } catch (err: any) {
      setStatus('error');
      const errorMsg = err.message || 'Failed to complete data ingestion';
      setError(errorMsg);
      toast({
        title: "Ingestion Failed",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  // Function to reset the process
  const resetProcess = () => {
    setCurrentStep(1);
    setColumns([]);
    setStatus('idle');
    setRecordCount(null);
    setError(null);
    setSelectedTable('');
    setTables([]);
  };

  // Select appropriate next step button based on current step
  const renderNextStepButton = () => {
    if (currentStep === 1) {
      return (
        <Button 
          onClick={connectToSource} 
          disabled={status === 'connecting'}
          className="mt-6"
        >
          {status === 'connecting' ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              Connect to Source
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      );
    } else if (currentStep === 2) {
      return (
        <Button 
          onClick={loadColumns} 
          disabled={status === 'fetching' || !selectedTable}
          className="mt-6"
        >
          {status === 'fetching' ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading Columns...
            </>
          ) : (
            <>
              Load Columns
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      );
    } else if (currentStep === 3) {
      return (
        <Button 
          onClick={startIngestion} 
          disabled={status === 'ingesting' || columns.filter(c => c.selected).length === 0}
          className="mt-6"
        >
          {status === 'ingesting' ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Ingesting Data...
            </>
          ) : (
            <>
              Start Ingestion
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      );
    }
    
    return null;
  };

  return (
    <div className="container mx-auto p-4 py-8">
      <div className="space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-databridge-800">Data Voyager Bridge</h1>
          <p className="text-muted-foreground mt-2">Transfer data between ClickHouse and Flat Files effortlessly</p>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Configure Data Flow</CardTitle>
            <CardDescription>
              Select source and target data systems
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center text-databridge-700">
                  <Database className="w-4 h-4 mr-2" />
                  Source
                </h3>
                <Tabs
                  defaultValue={sourceType}
                  onValueChange={(value) => setSourceType(value as ConnectionType)}
                  className="w-full"
                >
                  <TabsList className="w-full mb-4">
                    <TabsTrigger value="clickhouse" className="w-1/2">ClickHouse</TabsTrigger>
                    <TabsTrigger value="flatfile" className="w-1/2">Flat File</TabsTrigger>
                  </TabsList>
                  <TabsContent value="clickhouse" className="mt-0">
                    <SourceConfig 
                      type="clickhouse" 
                      config={sourceConfig as ClickHouseConfig}
                      onConfigChange={handleSourceConfigChange}
                    />
                  </TabsContent>
                  <TabsContent value="flatfile" className="mt-0">
                    <SourceConfig 
                      type="flatfile" 
                      config={sourceConfig as FlatFileConfig}
                      onConfigChange={handleSourceConfigChange}
                    />
                  </TabsContent>
                </Tabs>
              </div>
              
              <div>
                <h3 className="font-medium mb-2 flex items-center text-databridge-700">
                  <FileText className="w-4 h-4 mr-2" />
                  Target
                </h3>
                <Tabs
                  defaultValue={targetType}
                  onValueChange={(value) => setTargetType(value as ConnectionType)}
                  className="w-full"
                >
                  <TabsList className="w-full mb-4">
                    <TabsTrigger value="clickhouse" className="w-1/2">ClickHouse</TabsTrigger>
                    <TabsTrigger value="flatfile" className="w-1/2">Flat File</TabsTrigger>
                  </TabsList>
                  <TabsContent value="clickhouse" className="mt-0">
                    <TargetConfig 
                      type="clickhouse" 
                      config={targetConfig as ClickHouseConfig}
                      onConfigChange={handleTargetConfigChange}
                    />
                  </TabsContent>
                  <TabsContent value="flatfile" className="mt-0">
                    <TargetConfig 
                      type="flatfile" 
                      config={targetConfig as FlatFileConfig}
                      onConfigChange={handleTargetConfigChange}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
            
            {renderNextStepButton()}
          </CardContent>
        </Card>
        
        {(currentStep >= 2 && sourceType === 'clickhouse' && tables.length > 0) && (
          <Card className="animate-slide-in">
            <CardHeader>
              <CardTitle>Select Table</CardTitle>
              <CardDescription>
                Choose a table from the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tables.map(table => (
                  <Button
                    key={table}
                    variant={selectedTable === table ? "default" : "outline"}
                    onClick={() => setSelectedTable(table)}
                    className="justify-start"
                  >
                    {table}
                  </Button>
                ))}
              </div>
              {renderNextStepButton()}
            </CardContent>
          </Card>
        )}
        
        {currentStep >= 3 && columns.length > 0 && (
          <Card className="animate-slide-in">
            <CardHeader>
              <CardTitle>Select Columns</CardTitle>
              <CardDescription>
                Choose which columns to include in the data transfer
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ColumnSelector 
                columns={columns} 
                onToggleColumn={toggleColumnSelection}
                onToggleAll={toggleAllColumns}
              />
              {renderNextStepButton()}
            </CardContent>
          </Card>
        )}
        
        {(status === 'ingesting' || status === 'completed' || status === 'error') && (
          <Card className="animate-slide-in">
            <CardHeader>
              <CardTitle>Status & Results</CardTitle>
              <CardDescription>
                Data ingestion progress and results
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusDisplay 
                status={status} 
                recordCount={recordCount}
                error={error}
              />
              
              {status === 'completed' && (
                <Button 
                  onClick={resetProcess} 
                  variant="outline" 
                  className="mt-4"
                >
                  Start New Transfer
                </Button>
              )}
              
              {status === 'error' && (
                <Button 
                  onClick={() => startIngestion()}
                  className="mt-4"
                >
                  Retry
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Index;
