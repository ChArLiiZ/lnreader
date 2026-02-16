import {
  getErrorMessage,
  AppError,
  NetworkError,
  PluginError,
  ParseError,
  classifyError,
} from '../error';

describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('converts non-Error values to string', () => {
    expect(getErrorMessage('string error')).toBe('string error');
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });
});

describe('classifyError', () => {
  it('returns existing AppError subclasses unchanged', () => {
    const err = new NetworkError('timeout');
    expect(classifyError(err)).toBe(err);
  });

  it('classifies network-related errors', () => {
    const result = classifyError(new Error('Network request failed'));
    expect(result).toBeInstanceOf(NetworkError);
    expect(result.message).toBe('Network request failed');
  });

  it('classifies timeout errors as NetworkError', () => {
    expect(classifyError(new Error('Request timeout'))).toBeInstanceOf(
      NetworkError,
    );
  });

  it('classifies parse/JSON errors as ParseError', () => {
    expect(
      classifyError(new Error('Unexpected token < in JSON')),
    ).toBeInstanceOf(ParseError);
  });

  it('classifies with pluginId as PluginError', () => {
    const result = classifyError(new Error('something went wrong'), 'esjzone');
    expect(result).toBeInstanceOf(PluginError);
    expect((result as PluginError).pluginId).toBe('esjzone');
  });

  it('classifies generic errors as AppError', () => {
    const result = classifyError(new Error('unknown issue'));
    expect(result).toBeInstanceOf(AppError);
    expect(result).not.toBeInstanceOf(NetworkError);
    expect(result).not.toBeInstanceOf(ParseError);
  });

  it('handles string errors', () => {
    const result = classifyError('fetch failed');
    expect(result).toBeInstanceOf(NetworkError);
  });
});

describe('error class hierarchy', () => {
  it('NetworkError is an AppError', () => {
    expect(new NetworkError('test')).toBeInstanceOf(AppError);
    expect(new NetworkError('test')).toBeInstanceOf(Error);
  });

  it('PluginError is an AppError', () => {
    expect(new PluginError('test')).toBeInstanceOf(AppError);
  });

  it('ParseError is an AppError', () => {
    expect(new ParseError('test')).toBeInstanceOf(AppError);
  });

  it('PluginError stores pluginId', () => {
    const err = new PluginError('fail', 'myPlugin');
    expect(err.pluginId).toBe('myPlugin');
    expect(err.name).toBe('PluginError');
  });
});
