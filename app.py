from flask import Flask, render_template, request, jsonify
import clickhouse_connect
import pandas as pd
import io
import os
import jwt # Import PyJWT
import logging # For better logging

app = Flask(__name__)

# --- Configuration ---
# IMPORTANT: Replace with your actual secret key! Keep this secret!
# Consider loading from environment variables or a config file.
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'au23iouhWENJ')
# Define an allowed base directory for file operations
# IMPORTANT: Ensure this directory exists and the application has write permissions.
ALLOWED_FILE_PATH_BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), 'data_files'))

# Ensure the base directory for files exists
if not os.path.exists(ALLOWED_FILE_PATH_BASE):
    try:
        os.makedirs(ALLOWED_FILE_PATH_BASE)
        print(f"Created allowed data directory: {ALLOWED_FILE_PATH_BASE}")
    except OSError as e:
        print(f"CRITICAL ERROR: Failed to create data directory {ALLOWED_FILE_PATH_BASE}: {e}")
        # Consider exiting if the directory is essential and cannot be created

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Utility Functions ---

def validate_and_normalize_path(user_path):
    """Validates if the path is within the ALLOWED_FILE_PATH_BASE and returns the absolute path."""
    if not user_path:
        raise ValueError("File path cannot be empty.")

    # Prevent directory traversal attacks (basic checks)
    if ".." in user_path or user_path.startswith(("/", "\\")):
         raise ValueError("Invalid file path format or attempt to access restricted areas.")

    # Create absolute path based on the allowed base directory
    absolute_user_path = os.path.abspath(os.path.join(ALLOWED_FILE_PATH_BASE, user_path))

    # Check if the resulting path is truly within the allowed base directory
    if os.path.commonpath([ALLOWED_FILE_PATH_BASE]) != os.path.commonpath([ALLOWED_FILE_PATH_BASE, absolute_user_path]):
        logging.warning(f"Path validation failed: User path '{user_path}' resolved outside allowed base '{ALLOWED_FILE_PATH_BASE}'")
        raise ValueError("Specified path is outside the allowed data directory.")

    logging.info(f"Validated path: '{user_path}' -> '{absolute_user_path}'")
    return absolute_user_path

def validate_jwt(token):
    """Validates the JWT token using PyJWT."""
    if not token:
        return False # Or raise an error if JWT is mandatory
    try:
        # Decode the token. This verifies signature and expiration (if exp claim exists)
        # Specify the algorithm(s) you expect.
        # Add audience or issuer checks if needed: options={"require": ["exp", "iss", "aud"]}
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=["HS256"] # Adjust algorithm as needed (e.g., RS256)
        )
        logging.info(f"JWT validated successfully for user/subject: {payload.get('sub', 'N/A')}")
        return True # Token is valid
    except jwt.ExpiredSignatureError:
        logging.warning("JWT validation failed: Token has expired")
        raise ValueError("Authentication token has expired. Please provide a fresh token.")
    except jwt.InvalidTokenError as e:
        # Catches various errors like invalid signature, malformed token, etc.
        logging.warning(f"JWT validation failed: Invalid token - {e}")
        raise ValueError(f"Authentication token is invalid: {e}")
    except Exception as e:
        # Catch unexpected errors during validation
        logging.error(f"Unexpected error during JWT validation: {e}", exc_info=True)
        raise ValueError("An unexpected error occurred during token validation.")


def get_clickhouse_client(config):
    """Establishes a ClickHouse connection using provided config."""
    # (Error handling within this function is already reasonably detailed)
    # Added check for JWT validation result
    jwt_token = config.get('jwt')
    password = config.get('password')
    auth_method = None

    try:
        # ... (rest of the initial validation remains the same) ...
        required_keys = ['host', 'port', 'database', 'user']
        if not all(key in config and config[key] for key in required_keys):
             raise ValueError("Missing required ClickHouse connection parameters (host, port, database, user).")

        if not password and not jwt_token:
             raise ValueError("Either password or JWT token must be provided for ClickHouse connection.")

        # Prepare connection parameters (same as before)
        connect_args = {
            'host': config['host'],
            'port': int(config['port']), # Ensure port is int
            'database': config['database'],
            'user': config['user'],
            'secure': config.get('secure', False), # Default to False if not provided
            'settings': {
                'insert_deduplicate': 0,
                'insert_distributed_sync': 1
            }
        }

        if jwt_token:
            logging.info("Attempting JWT validation...")
            # *** Actual JWT validation happens here ***
            if not validate_jwt(jwt_token):
                 # validate_jwt now raises ValueError on failure, so this might not be hit
                 # but kept as a safeguard if validate_jwt is changed to return False
                 raise ValueError("JWT token validation failed.")
            auth_method = "JWT"

            if connect_args['port'] in [8123, 8443]:
                 logging.info("Using JWT via HTTP Headers for connection.")
                 connect_args['http_headers'] = {'Authorization': f'Bearer {jwt_token}'}
                 connect_args.pop('password', None)
            else:
                # Handle non-HTTP ports - assuming password might still be needed or JWT used differently
                 logging.warning(f"JWT provided for non-HTTP port ({connect_args['port']}). Protocol might not natively support JWT header. Relying on password if provided.")
                 if password:
                     connect_args['password'] = password
                     auth_method = "Password (JWT provided but non-HTTP port)"
                 else:
                     # If only JWT for native, it's unlikely to work with clickhouse-connect directly
                     raise ValueError(f"JWT authentication via native protocol on port {connect_args['port']} likely requires password or specific server/proxy setup.")

        elif password:
            connect_args['password'] = password
            auth_method = "Password"
        else:
             raise ValueError("No password or JWT token provided.") # Should be caught earlier

        logging.info(f"Attempting connection to {connect_args['host']}:{connect_args['port']} using {auth_method}...")
        # Remove sensitive info before logging args
        log_args = connect_args.copy()
        log_args.pop('password', None)
        # log_args.pop('jwt', None) # JWT already validated, no need to log
        if 'http_headers' in log_args: log_args['http_headers'] = {'Authorization': 'Bearer [REDACTED]'}
        logging.debug(f"Connection args (sensitive info redacted): {log_args}") # Log args at DEBUG level

        client = clickhouse_connect.get_client(**connect_args)
        client.ping() # Verify connection
        logging.info("ClickHouse connection successful.")
        return client

    except (ValueError, ConnectionError) as ve:
         logging.error(f"Connection/Configuration Error: {ve}", exc_info=True) # Log trace for value/conn errors
         raise # Re-raise user-facing errors
    except clickhouse_connect.driver.exceptions.Error as ch_err:
        logging.error(f"ClickHouse Driver Error: {ch_err}", exc_info=True)
        err_str = str(ch_err).lower()
        # More specific error messages remain useful
        if 'authentication failed' in err_str or 'auth failed' in err_str:
            raise ConnectionError(f"ClickHouse authentication failed for user '{config.get('user', 'N/A')}'. Check credentials/token.") from ch_err
        elif 'connection refused' in err_str or 'timed out' in err_str:
             raise ConnectionError(f"Could not connect to ClickHouse at {config.get('host', 'N/A')}:{config.get('port', 'N/A')}. Check host/port and network.") from ch_err
        elif 'unknown database' in err_str:
             raise ValueError(f"ClickHouse database '{config.get('database', 'N/A')}' not found.") from ch_err
        else:
            raise ConnectionError(f"ClickHouse driver error: {ch_err}") from ch_err
    except Exception as e:
        logging.error(f"Unexpected error during ClickHouse connection setup: {e}", exc_info=True)
        raise ConnectionError(f"An unexpected error occurred during connection setup: {e}") from e


@app.route('/get_tables', methods=['POST'])
def get_tables():
    config = request.json
    client = None
    try:
        client = get_clickhouse_client(config)
        query = f"SELECT name FROM system.tables WHERE database = %(database)s ORDER BY name LIMIT 1000"
        logging.info(f"Fetching tables for database: {config.get('database')}")
        tables_result = client.query(query, parameters={'database': config['database']})
        tables = [row[0] for row in tables_result.result_rows]
        logging.info(f"Found {len(tables)} tables.")
        return jsonify({'tables': tables})
    except (ValueError, ConnectionError, clickhouse_connect.driver.exceptions.Error) as e:
        logging.error(f"Failed to get tables: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logging.error(f"Unexpected error in /get_tables: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected server error occurred while fetching tables.'}), 500
    finally:
        if client:
            client.close()


@app.route('/get_columns', methods=['POST'])
def get_columns():
    config = request.json
    source_type = config.get('source_type')
    client = None
    columns_data = [] # Initialize list to hold column dicts
    try:
        if source_type == 'clickhouse':
            table_name = config.get('table')
            if not table_name:
                raise ValueError("Missing 'table' parameter for ClickHouse source.")

            client = get_clickhouse_client(config)
            # Fetch name and type from system.columns
            query = f"SELECT name, type FROM system.columns WHERE database = %(database)s AND table = %(table)s ORDER BY position"
            logging.info(f"Fetching columns and types for table: {config.get('database')}.{table_name}")
            columns_result = client.query(query, parameters={'database': config['database'], 'table': table_name})

            if not columns_result.result_rows:
                 logging.warning(f"No columns found for table '{table_name}' in db '{config['database']}'. Table might be empty or not exist.")
                 raise ValueError(f"Table '{table_name}' not found or has no columns in database '{config['database']}'.")

            # Format the output as required by frontend
            for name, ch_type in columns_result.result_rows:
                columns_data.append({
                    'name': name,
                    'type': ch_type, # Use the type directly from ClickHouse
                    'selected': True # Default to selected
                })

            logging.info(f"Found {len(columns_data)} columns for table {table_name}.")
            return jsonify({'columns': columns_data})

        elif source_type == 'flatfile':
            user_file_path = config.get('file_path')
            delimiter = config.get('delimiter')
            has_header = config.get('has_header', True)

            if not delimiter:
                raise ValueError("Missing 'delimiter' for Flat File source.")

            absolute_file_path = validate_and_normalize_path(user_file_path)

            if not os.path.exists(absolute_file_path):
                 raise FileNotFoundError(f"File not found at specified path: {user_file_path}")
            if not os.path.isfile(absolute_file_path):
                raise ValueError(f"Specified path is not a file: {user_file_path}")

            if not has_header:
                logging.info(f"Flat file source {user_file_path} has no header. Cannot extract columns.")
                return jsonify({'columns': []})

            try:
                logging.info(f"Inferring columns and types from file: {user_file_path}")
                # Read a sample of rows to infer types more accurately than just header
                # Adjust nrows based on expected file structure variability
                df_sample = pd.read_csv(absolute_file_path, sep=delimiter, nrows=100, low_memory=False)

                if df_sample.empty:
                     logging.warning(f"File '{user_file_path}' has a header but appears to have no data rows for type inference.")
                     # Fallback: return columns with unknown type
                     for col_name in df_sample.columns:
                         columns_data.append({'name': col_name, 'type': 'UNKNOWN', 'selected': True})
                else:
                    # Infer types from the sample
                    for col_name in df_sample.columns:
                        # Map pandas dtype to a simpler string representation (or keep CH types)
                        # Using the existing CH mapping function here for consistency
                        inferred_type = pandas_to_clickhouse_type(df_sample[col_name].dtype)
                        columns_data.append({
                            'name': col_name,
                            'type': inferred_type,
                            'selected': True
                        })

                logging.info(f"Inferred {len(columns_data)} columns from file {user_file_path}.")
                return jsonify({'columns': columns_data})

            except pd.errors.EmptyDataError:
                 # This case means the file is completely empty (no header either)
                 logging.warning(f"File '{user_file_path}' is completely empty.")
                 # Technically caught by os.path.exists, but good practice
                 return jsonify({'columns': []}) # Return empty list
            except Exception as pd_err:
                logging.error(f"Error reading sample from file '{user_file_path}': {pd_err}", exc_info=True)
                raise ValueError(f"Error reading file '{os.path.basename(user_file_path)}': Check format, encoding, and delimiter.") from pd_err
        else:
            raise ValueError(f"Invalid source_type specified: {source_type}")

    except (ValueError, ConnectionError, FileNotFoundError, clickhouse_connect.driver.exceptions.Error) as e:
        logging.error(f"Failed to get columns: {e}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logging.error(f"Unexpected error in /get_columns: {e}", exc_info=True)
        return jsonify({'error': 'An unexpected server error occurred while fetching columns.'}), 500
    finally:
        if client:
            client.close()

# --- Helper for FF -> CH Schema Generation (remains the same) ---

def pandas_to_clickhouse_type(dtype):
    """Maps pandas dtype to a suitable ClickHouse data type string."""
    # This is a basic mapping, may need significant enhancement for production
    # Consider Nullable(), LowCardinality(), specific Int/UInt sizes, FixedString, etc.
    # Also, ClickHouse types like DateTime64, Decimal need specific precision/scale.
    if pd.api.types.is_integer_dtype(dtype):
        # Defaulting to Int64, might need smaller types based on data range
        return 'Int64'
    elif pd.api.types.is_float_dtype(dtype):
        return 'Float64'
    elif pd.api.types.is_bool_dtype(dtype):
        return 'UInt8' # ClickHouse often uses 0/1 for booleans
    elif pd.api.types.is_datetime64_any_dtype(dtype):
        # Basic DateTime, might need DateTime64 with precision
        return 'DateTime'
    elif pd.api.types.is_string_dtype(dtype) or pd.api.types.is_object_dtype(dtype):
        # Default to String for objects/strings
        return 'String'
    else:
        logging.warning(f"Unhandled pandas dtype: {dtype}. Defaulting to String.")
        return 'String' # Fallback

# --- Main Ingestion Endpoint ---

@app.route('/ingest', methods=['POST'])
def ingest():
    config = request.json
    flow_type = config.get('flow_type')
    client = None
    processed_count = 0

    logging.info(f"Starting ingestion flow: {flow_type}")
    # Avoid logging sensitive data from config
    log_config = {k: v for k, v in config.items() if k not in ['password', 'jwt']}
    logging.debug(f"Received config (sensitive data redacted): {log_config}")

    try:
        if flow_type == 'ch_to_ff':
            # --- ClickHouse to Flat File ---
            logging.info("Executing ClickHouse -> Flat File flow")
            selected_columns = config.get('columns', [])
            source_table = config.get('source_table')
            user_target_file = config.get('target_file')
            target_delimiter = config.get('target_delimiter')
            include_header = config.get('include_header', True)

            # --- Input Validation ---
            if not selected_columns:
                raise ValueError("No columns selected for ingestion.")
            if not source_table:
                raise ValueError("Source ClickHouse table not specified.")
            if not target_delimiter:
                 raise ValueError("Target file delimiter not specified.")

            absolute_target_file = validate_and_normalize_path(user_target_file)
            target_dir = os.path.dirname(absolute_target_file)
            # Ensure target directory exists (create if needed and possible)
            if not os.path.exists(target_dir):
                logging.info(f"Target directory {target_dir} does not exist, attempting to create.")
                try:
                    os.makedirs(target_dir, exist_ok=True)
                except OSError as e:
                     logging.error(f"Failed to create target directory '{target_dir}': {e}")
                     # Raise a user-friendly error
                     raise ValueError(f"Cannot create target directory for file '{user_target_file}'. Check permissions.")
            # --- End Validation ---

            client = get_clickhouse_client(config) # Handles connection and auth
            quoted_columns = [f'"{col}"' for col in selected_columns]
            select_query = f'SELECT {", ".join(quoted_columns)} FROM "{config["database"]}"."{source_table}"'

            logging.info(f"Executing query: {select_query}")
            # TODO: Implement streaming/batching for large data instead of query_df
            df = client.query_df(select_query)
            processed_count = len(df)
            logging.info(f"Fetched {processed_count} records from ClickHouse table {source_table}.")

            logging.info(f"Writing data to {user_target_file} (at {absolute_target_file}) with delimiter '{target_delimiter}'")
            try:
                df.to_csv(absolute_target_file, sep=target_delimiter, index=False, header=include_header, quoting=1)
            except IOError as e:
                logging.error(f"Failed to write to target file {absolute_target_file}: {e}")
                raise RuntimeError(f"Failed to write data to file '{user_target_file}'. Check permissions and disk space.") from e
            except Exception as e:
                 logging.error(f"Unexpected error writing CSV to {absolute_target_file}: {e}", exc_info=True)
                 raise RuntimeError(f"An unexpected error occurred while writing the output file.") from e

            logging.info("ClickHouse -> Flat File ingestion successful.")
            return jsonify({'success': True, 'records_processed': processed_count})

        elif flow_type == 'ff_to_ch':
            # --- Flat File to ClickHouse ---
            logging.info("Executing Flat File -> ClickHouse flow")
            user_source_file = config.get('source_file')
            source_delimiter = config.get('source_delimiter')
            source_has_header = config.get('source_has_header', True)
            selected_columns = config.get('columns', [])
            target_table = config.get('target_table')
            target_create = config.get('target_create', False)

            # --- Input Validation ---
            if not source_delimiter:
                raise ValueError("Source file delimiter not specified.")
            if not target_table:
                raise ValueError("Target ClickHouse table not specified.")

            absolute_source_file = validate_and_normalize_path(user_source_file)

            if not os.path.exists(absolute_source_file):
                 raise FileNotFoundError(f"Source file not found: {user_source_file}")
            if not os.path.isfile(absolute_source_file):
                raise ValueError(f"Source path is not a file: {user_source_file}")
            # --- End Validation ---

            logging.info(f"Reading data from {user_source_file} (at {absolute_source_file})")
            try:
                # TODO: Implement streaming/batching for large data instead of reading all at once
                df = pd.read_csv(
                    absolute_source_file,
                    sep=source_delimiter,
                    header=0 if source_has_header else None,
                    low_memory=False
                )
                # ... (rest of column selection logic remains similar) ...
                if source_has_header:
                     if selected_columns:
                         missing_cols = [col for col in selected_columns if col not in df.columns]
                         if missing_cols:
                              raise ValueError(f"Selected columns not found in file header: {missing_cols}")
                         df = df[selected_columns]
                else:
                    logging.warning("Reading file without header. Column matching relies on position.")
                    if selected_columns:
                        logging.warning("Columns were selected in UI, but file has no header. Selection ignored.")

                processed_count = len(df)
                if processed_count == 0:
                     logging.info("Source file is empty. Nothing to ingest.")
                     return jsonify({'success': True, 'records_processed': 0})
                logging.info(f"Read {processed_count} records from file.")

            except pd.errors.EmptyDataError:
                 logging.warning(f"Source file '{user_source_file}' is empty. Nothing to ingest.")
                 return jsonify({'success': True, 'records_processed': 0})
            except Exception as pd_err:
                logging.error(f"Error reading CSV file '{user_source_file}': {pd_err}", exc_info=True)
                raise ValueError(f"Error reading CSV file '{os.path.basename(user_source_file)}'. Check format, encoding, and delimiter.") from pd_err

            # --- Connect to ClickHouse Target ---
            client = get_clickhouse_client(config)
            db_name = config['database']
            # Ensure table name is reasonably safe (basic check - consider more robust CSQL injection checks if needed)
            if not target_table.isalnum() and '_' not in target_table:
                 raise ValueError(f"Invalid target table name: {target_table}. Use alphanumeric characters and underscores.")
            full_table_name = f'"{db_name}"."{target_table}"'

            # --- Handle Table Creation (logic remains similar, added logging) ---
            table_exists = False
            try:
                logging.debug(f"Checking existence of table {full_table_name}")
                # Using DESCRIBE can be slightly more reliable than CHECK in some edge cases
                client.command(f'DESCRIBE TABLE {full_table_name}')
                table_exists = True
                logging.info(f"Target table {full_table_name} exists.")
            except clickhouse_connect.driver.exceptions.ClickHouseError as e:
                err_str = str(e)
                if 'UNKNOWN_TABLE' in err_str or 'Table doesn\'t exist' in err_str or 'code: 60' in err_str:
                    logging.info(f"Target table {full_table_name} does not exist.")
                    table_exists = False
                else:
                    logging.warning(f"Error checking table existence for {full_table_name}: {e}")
                    raise # Re-raise unexpected ClickHouse errors

            if not table_exists:
                if target_create:
                    if not source_has_header:
                        raise ValueError("Cannot create table automatically: Source file has no header to infer schema.")
                    logging.info(f"Attempting to create target table {full_table_name}...")
                    try:
                        cols_with_types = []
                        for col_name, dtype in df.dtypes.items():
                             # Basic quoting for safety
                             safe_col_name = f'"{str(col_name)}"'
                             ch_type = pandas_to_clickhouse_type(dtype)
                             cols_with_types.append(f'{safe_col_name} {ch_type}')
                        # Simple MergeTree, consider allowing engine/order key specification in UI/config
                        # Construct the columns part of the query with newlines and indentation
                        columns_sql_part = ",\n    ".join(cols_with_types)
                        create_statement = f"CREATE TABLE {full_table_name} (\n    {columns_sql_part}\n) ENGINE = MergeTree() ORDER BY tuple()"
                        logging.info(f"Executing CREATE TABLE statement for {full_table_name}")
                        logging.debug(f"Create statement: {create_statement}")
                        client.command(create_statement)
                        logging.info(f"Table {full_table_name} created successfully.")
                    except Exception as create_err:
                        logging.error(f"Failed to auto-create table {full_table_name}: {create_err}", exc_info=True)
                        raise RuntimeError(f"Failed to auto-create table {full_table_name}: {create_err}") from create_err
                else:
                     raise ValueError(f"Target table {full_table_name} does not exist and 'Create Table' option was not checked.")
            elif target_create:
                 logging.info("Target table exists, 'Create Table' option ignored.")

            # --- Insert Data --- #
            logging.info(f"Inserting {processed_count} records into {full_table_name}...")
            try:
                # TODO: Implement streaming/batching for large data instead of insert_df
                client.insert_df(full_table_name, df)
                logging.info(f"Successfully inserted {processed_count} records into {full_table_name}.")
            except clickhouse_connect.driver.exceptions.Error as insert_err:
                # Catch specific insertion errors
                logging.error(f"ClickHouse insert error into {full_table_name}: {insert_err}", exc_info=True)
                # Try to provide a more helpful message based on common errors
                err_str = str(insert_err).lower()
                if 'type mismatch' in err_str or 'cannot parse' in err_str:
                    raise RuntimeError(f"Data type mismatch error inserting into {target_table}. Check file data types against table schema.") from insert_err
                elif 'unknown column' in err_str or 'not found' in err_str:
                    raise RuntimeError(f"Column mismatch error inserting into {target_table}. Check file header/columns against table schema.") from insert_err
                else:
                    raise RuntimeError(f"Error inserting data into ClickHouse table {target_table}: {insert_err}") from insert_err
            except Exception as e:
                 logging.error(f"Unexpected error during ClickHouse insert into {full_table_name}: {e}", exc_info=True)
                 raise RuntimeError("An unexpected error occurred during data insertion.") from e

            return jsonify({'success': True, 'records_processed': processed_count})

        else:
            raise ValueError(f"Invalid flow_type specified: {flow_type}")

    except (ValueError, ConnectionError, FileNotFoundError, clickhouse_connect.driver.exceptions.Error, RuntimeError) as e:
        error_message = str(e)
        logging.error(f"Ingestion failed: {error_message}")
        return jsonify({'success': False, 'error': error_message, 'records_processed': processed_count}), 400
    except Exception as e:
        error_message = f"An unexpected server error occurred during ingestion."
        logging.error(f"Unexpected Ingestion Error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': error_message, 'records_processed': processed_count}), 500
    finally:
        if client:
            try:
                client.close()
                logging.info("ClickHouse connection closed.")
            except Exception as close_err:
                 logging.error(f"Error closing ClickHouse connection: {close_err}", exc_info=True)


if __name__ == '__main__':
    # Make accessible on local network if needed, use 0.0.0.0
    # Use a specific port if default 5000 is taken
    # Turn off debug mode for production deployment
    is_debug = os.environ.get('FLASK_ENV') == 'development'
    logging.info(f"Starting Flask app (Debug Mode: {is_debug})")
    if not is_debug and JWT_SECRET_KEY == 'YOUR_REPLACE_ME_SUPER_SECRET_KEY':
        logging.critical("CRITICAL SECURITY WARNING: Running in non-debug mode with the default JWT_SECRET_KEY!")

    app.run(host='0.0.0.0', port=5000, debug=is_debug) 