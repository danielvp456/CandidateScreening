import { GetStaticProps, InferGetStaticPropsType } from 'next';
import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

type Props = {
  spec: Record<string, any>;
};

function ApiDocPage({ spec }: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div style={{ padding: '10px' }}>
      <SwaggerUI spec={spec} />
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
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
    apiFolder: 'src/pages/api', 
  });

  return {
    props: {
      spec,
    },
  };
};

export default ApiDocPage; 