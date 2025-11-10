import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ApiDocs() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}

import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

// Dynamically import SwaggerUI to avoid SSR issues
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading API Documentation...
    </div>
  )
});

export default function ApiDocs() {
  const [spec, setSpec] = useState(null);

  useEffect(() => {
    // Load the OpenAPI spec
    fetch('/api/openapi')
      .then(response => response.json())
      .then(data => setSpec(data))
      .catch(error => console.error('Error loading OpenAPI spec:', error));
  }, []);

  return (
    <>
      <Head>
        <title>API Documentation - Dispatch Database</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
      </Head>

      <div style={{ height: '100vh' }}>
        {spec ? (
          <SwaggerUI
            spec={spec}
            docExpansion="list"
            defaultModelsExpandDepth={2}
            defaultModelExpandDepth={2}
            tryItOutEnabled={true}
            supportedSubmitMethods={['get', 'post', 'put', 'delete', 'patch']}
            onComplete={() => {
              console.log('Swagger UI loaded successfully');
            }}
            requestInterceptor={(request) => {
              // Add any custom request headers or modifications here
              return request;
            }}
            responseInterceptor={(response) => {
              // Handle responses here if needed
              return response;
            }}
            uiConfig={{
              deepLinking: true,
              displayOperationId: false,
              defaultModelsExpandDepth: 1,
              defaultModelExpandDepth: 1,
              defaultModelRendering: 'example',
              displayRequestDuration: true,
              docExpansion: 'list',
              filter: true,
              showExtensions: true,
              showCommonExtensions: true,
              tryItOutEnabled: true
            }}
            plugins={[
              // Add any custom plugins here
            ]}
          />
        ) : (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            fontSize: '18px',
            color: '#666'
          }}>
            Loading API Documentation...
          </div>
        )}
      </div>

      <style jsx global>{`
        .swagger-ui .topbar {
          display: none;
        }
        
        .swagger-ui .info {
          margin: 20px 0;
        }
        
        .swagger-ui .info .title {
          color: #3b82f6;
          font-size: 2.5rem;
          font-weight: bold;
        }
        
        .swagger-ui .info .description {
          font-size: 1.1rem;
          line-height: 1.6;
        }
        
        .swagger-ui .scheme-container {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        }
        
        .swagger-ui .opblock.opblock-get {
          border-color: #10b981;
        }
        
        .swagger-ui .opblock.opblock-post {
          border-color: #3b82f6;
        }
        
        .swagger-ui .opblock.opblock-put {
          border-color: #f59e0b;
        }
        
        .swagger-ui .opblock.opblock-delete {
          border-color: #ef4444;
        }
        
        .swagger-ui .opblock .opblock-summary {
          border-radius: 6px;
        }
        
        .swagger-ui .opblock .opblock-summary-description {
          font-weight: 500;
        }
        
        .swagger-ui .btn.execute {
          background-color: #3b82f6;
          border-color: #3b82f6;
        }
        
        .swagger-ui .btn.execute:hover {
          background-color: #2563eb;
          border-color: #2563eb;
        }
        
        .swagger-ui .response-col_status {
          font-weight: bold;
        }
        
        .swagger-ui .response-col_status-200 {
          color: #10b981;
        }
        
        .swagger-ui .response-col_status-400,
        .swagger-ui .response-col_status-404,
        .swagger-ui .response-col_status-500 {
          color: #ef4444;
        }
        
        .swagger-ui .model-title {
          color: #1f2937;
          font-weight: bold;
        }
        
        .swagger-ui .model .property {
          color: #374151;
        }
        
        .swagger-ui .model .property.primitive {
          color: #059669;
        }
        
        .swagger-ui .model .property.array {
          color: #7c3aed;
        }
        
        .swagger-ui .model .property.object {
          color: #dc2626;
        }
        
        .swagger-ui .parameter__name {
          font-weight: 600;
          color: #1f2937;
        }
        
        .swagger-ui .parameter__type {
          color: #6b7280;
          font-size: 0.875rem;
        }
        
        .swagger-ui .parameter__deprecated {
          color: #ef4444;
          font-weight: bold;
        }
        
        .swagger-ui .renderedMarkdown p {
          margin: 0.5rem 0;
          line-height: 1.6;
        }
        
        .swagger-ui .renderedMarkdown code {
          background-color: #f1f5f9;
          color: #e11d48;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
        }
        
        .swagger-ui .renderedMarkdown pre {
          background-color: #1f2937;
          color: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
        
        .swagger-ui .renderedMarkdown pre code {
          background-color: transparent;
          color: inherit;
          padding: 0;
        }
        
        .swagger-ui .auth-container {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin: 20px 0;
        }
        
        .swagger-ui .auth-btn-wrapper {
          margin-top: 10px;
        }
        
        .swagger-ui .auth-btn-wrapper .btn-done {
          background-color: #10b981;
          border-color: #10b981;
        }
        
        .swagger-ui .auth-btn-wrapper .btn-done:hover {
          background-color: #059669;
          border-color: #059669;
        }
      `}</style>
    </>
  );
}

        }
        
        .swagger-ui .auth-btn-wrapper .btn-done:hover {
          background-color: #059669;
          border-color: #059669;
        }
      `}</style>
    </>
  );
}
