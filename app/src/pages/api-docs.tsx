import { GetStaticProps, InferGetStaticPropsType } from 'next';
import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Dynamically import SwaggerUI to avoid SSR issues with the component
const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

type Props = {
  spec: Record<string, any>; // Define a more specific type if you have one for OpenAPI spec
};

function ApiDocPage({ spec }: InferGetStaticPropsType<typeof getStaticProps>) {
  // Render Swagger UI component with the spec fetched server-side
  return (
    <div style={{ padding: '10px' }}> {/* Optional: Add some padding */}
      <SwaggerUI spec={spec} />
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  // Import the spec generation function dynamically or ensure it runs server-side
  const { createSwaggerSpec } = await import('next-swagger-doc');

  const spec: Record<string, any> = createSwaggerSpec({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Candidate Screening API',
        version: '1.0.0',
        description: 'API for scoring candidates based on job descriptions using LLM',
      },
    },
    // Ensure this path points correctly to your API files relative to the project root
    apiFolder: 'src/pages/api', 
  });

  return {
    props: {
      spec,
    },
    // Optional: Revalidate the spec periodically if your API changes often
    // revalidate: 60, // Revalidate every 60 seconds
  };
};

export default ApiDocPage; 