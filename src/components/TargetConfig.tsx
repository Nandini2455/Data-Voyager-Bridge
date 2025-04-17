
import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClickHouseConfig, ConnectionType, FlatFileConfig } from '@/pages/Index';

interface TargetConfigProps {
  type: ConnectionType;
  config: ClickHouseConfig | FlatFileConfig;
  onConfigChange: (config: ClickHouseConfig | FlatFileConfig) => void;
}

const TargetConfig: React.FC<TargetConfigProps> = ({ type, config, onConfigChange }) => {
  const handleClickHouseChange = (field: keyof ClickHouseConfig, value: string) => {
    onConfigChange({
      ...(config as ClickHouseConfig),
      [field]: value
    });
  };

  const handleFlatFileChange = (field: keyof FlatFileConfig, value: string) => {
    onConfigChange({
      ...(config as FlatFileConfig),
      [field]: value
    });
  };

  if (type === 'clickhouse') {
    const clickHouseConfig = config as ClickHouseConfig;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="target-host">Host</Label>
            <Input
              id="target-host"
              placeholder="localhost"
              value={clickHouseConfig.host}
              onChange={(e) => handleClickHouseChange('host', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-port">Port</Label>
            <Input
              id="target-port"
              placeholder="8123"
              value={clickHouseConfig.port}
              onChange={(e) => handleClickHouseChange('port', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-database">Database</Label>
          <Input
            id="target-database"
            placeholder="default"
            value={clickHouseConfig.database}
            onChange={(e) => handleClickHouseChange('database', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-table">Table</Label>
          <Input
            id="target-table"
            placeholder="data_table"
            value={clickHouseConfig.table || ''}
            onChange={(e) => handleClickHouseChange('table', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-user">User</Label>
          <Input
            id="target-user"
            placeholder="default"
            value={clickHouseConfig.user}
            onChange={(e) => handleClickHouseChange('user', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-jwtToken">JWT Token</Label>
          <Input
            id="target-jwtToken"
            type="password"
            placeholder="Enter JWT token"
            value={clickHouseConfig.jwtToken}
            onChange={(e) => handleClickHouseChange('jwtToken', e.target.value)}
          />
        </div>
      </div>
    );
  } else {
    const flatFileConfig = config as FlatFileConfig;
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="target-filename">File Name</Label>
          <Input
            id="target-filename"
            placeholder="output.csv"
            value={flatFileConfig.filename}
            onChange={(e) => handleFlatFileChange('filename', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target-delimiter">Delimiter</Label>
          <Select
            value={flatFileConfig.delimiter}
            onValueChange={(value) => handleFlatFileChange('delimiter', value)}
          >
            <SelectTrigger id="target-delimiter">
              <SelectValue placeholder="Select delimiter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=",">Comma (,)</SelectItem>
              <SelectItem value="|">Pipe (|)</SelectItem>
              <SelectItem value="\t">Tab</SelectItem>
              <SelectItem value=";">Semicolon (;)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }
};

export default TargetConfig;
