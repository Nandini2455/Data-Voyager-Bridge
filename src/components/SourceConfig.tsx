import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClickHouseConfig, ConnectionType, FlatFileConfig } from '@/pages/Index';

interface SourceConfigProps {
  type: ConnectionType;
  config: ClickHouseConfig | FlatFileConfig;
  onConfigChange: (config: ClickHouseConfig | FlatFileConfig) => void;
}

const SourceConfig: React.FC<SourceConfigProps> = ({ type, config, onConfigChange }) => {
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
            <Label htmlFor="host">Host</Label>
            <Input
              id="host"
              placeholder="localhost"
              value={clickHouseConfig.host}
              onChange={(e) => handleClickHouseChange('host', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              placeholder="8123"
              value={clickHouseConfig.port}
              onChange={(e) => handleClickHouseChange('port', e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="database">Database</Label>
          <Input
            id="database"
            placeholder="default"
            value={clickHouseConfig.database}
            onChange={(e) => handleClickHouseChange('database', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user">User</Label>
          <Input
            id="user"
            placeholder="default"
            value={clickHouseConfig.user}
            onChange={(e) => handleClickHouseChange('user', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password <span className="text-xs text-muted-foreground">(or use JWT)</span></Label>
          <Input
            id="password"
            type="password"
            placeholder="Enter password"
            value={(config as ClickHouseConfig).password || ''}
            onChange={(e) => handleClickHouseChange('password' as keyof ClickHouseConfig, e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="jwtToken">JWT Token <span className="text-xs text-muted-foreground">(or use Password)</span></Label>
          <Input
            id="jwtToken"
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
          <Label htmlFor="filename">File Name</Label>
          <Input
            id="filename"
            placeholder="data.csv"
            value={flatFileConfig.filename}
            onChange={(e) => handleFlatFileChange('filename', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="delimiter">Delimiter</Label>
          <Select
            value={flatFileConfig.delimiter}
            onValueChange={(value) => handleFlatFileChange('delimiter', value)}
          >
            <SelectTrigger id="delimiter">
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

export default SourceConfig;
