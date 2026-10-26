import React, { useState } from 'react';

export interface DrawPictogramProps {
  /**
   * Path to the official NELBD draw pictogram PNG.
   * To add the official image, place the PNG at `src/assets/graphics/draw-pictogram.png`
   * and import/pass it to this component.
   */
  src?: string;
  alt?: string;
  className?: string;
}

/**
 * Dedicated reusable graphic component for the Draw Screen circle.
 * Reserves a predictable, dimensionally stable area above "TAP TO DRAW".
 * Supports transparent PNG files with object-fit: contain without cropping or filters.
 */
export const DrawPictogram: React.FC<DrawPictogramProps> = ({
  src,
  alt = 'NELBD Draw Pictogram',
  className = 'w-14 h-14 sm:w-16 sm:h-16',
}) => {
  const [hasError, setHasError] = useState(false);

  if (src && !hasError) {
    return (
      <div className={`flex items-center justify-center overflow-hidden ${className}`} aria-label={alt}>
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  // Dimensionally stable reserved area until the official PNG asset is supplied
  return (
    <div
      className={`flex items-center justify-center pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
};
