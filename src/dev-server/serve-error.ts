import { DevServerConfig, FileSystem, HttpRequest } from '../declarations';
import * as http  from 'http';
import * as path  from 'path';


export async function serve404(config: DevServerConfig, fs: FileSystem, req: HttpRequest, res: http.ServerResponse) {
  try {
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Expires': '0',
      'Content-Type': 'text/html'
    };

    let content: string;

    const pathName = req.pathname.toLowerCase();

    if (pathName.endsWith('.js') || pathName.endsWith('.css')) {
      headers['Content-Type'] = 'text/plain';
      content = [
        '404 File Not Found',
        'Url: ' + req.pathname,
        'File: ' + req.filePath
      ].join('\n');

    } else  {
      const tmpl404 = await fs.readFile(path.join(config.devServerDir, 'templates/404.html'));
      content = tmpl404.replace(
        '{content}',
        `File not found: ${req.pathname}`
      );
    }

    res.writeHead(404, headers);
    res.write(content);
    res.end();

  } catch (e) {
    serve500(res, e);
  }
}


export function serve500(res: http.ServerResponse, errorMessage: string) {
  res.writeHead(500, {
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Expires': '0',
    'Content-Type': 'text/plain'
  });
  res.write(errorMessage);
  res.end();
}
