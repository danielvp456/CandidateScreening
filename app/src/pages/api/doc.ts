import { withSwagger } from 'next-swagger-doc';

const swaggerHandler = withSwagger({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Candidate Screening API',
      version: '1.0.0',
      description: 'API for scoring candidates based on job descriptions using LLM',
    }
  },
  apiFolder: 'src/pages/api',
});

export default swaggerHandler(); 