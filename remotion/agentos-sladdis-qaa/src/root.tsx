import React from 'react';
import { Composition } from 'remotion';
import { QaaSladdisPlatform } from './video';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id='QaaSladdisPlatform'
      component={QaaSladdisPlatform}
      durationInFrames={2100}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
  );
};
