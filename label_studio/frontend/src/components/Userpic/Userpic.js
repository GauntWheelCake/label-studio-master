import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Block, Elem } from '../../utils/bem';
import { Tooltip } from '../Tooltip/Tooltip';
import './Userpic.styl';

const DEFAULT_AVATAR_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='48' fill='%23FFE8F0'/%3E%3Ccircle cx='48' cy='50' r='29' fill='%23FFF7F2'/%3E%3Cpath d='M24 45c4-18 17-29 34-28 16 1 25 12 25 29-9-9-17-13-27-13-12 0-22 4-32 12z' fill='%236B4B7A'/%3E%3Cpath d='M33 51c5 5 10 5 15 0M57 51c5 5 10 5 15 0' fill='none' stroke='%2339293F' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='35' cy='62' r='5' fill='%23FFB6C8' opacity='.75'/%3E%3Ccircle cx='66' cy='62' r='5' fill='%23FFB6C8' opacity='.75'/%3E%3Cpath d='M44 68c3 2 6 2 9 0' fill='none' stroke='%23D9829B' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M22 71c9 9 43 11 52 0 0 13-11 21-26 21S22 84 22 71z' fill='%23FFFFFF'/%3E%3C/svg%3E";

export const Userpic = forwardRef(({
  username,
  size,
  src,
  user,
  className,
  showUsername,
  style,
  ...rest
}, ref) => {
  const imgRef = useRef();
  const [finalUsername, setFinalUsername] = useState(username);
  const [finalSrc, setFinalSrc] = useState(user?.avatar ?? src ?? DEFAULT_AVATAR_IMAGE);
  const [imgVisible, setImgVisible] = useState(false);
  const [nameVisible, setNameVisible] = useState(true);

  if (size) {
    style = Object.assign({ width: size, height: size, fontSize: size * 0.4 }, style);
  }

  useEffect(() => {
    if (user) {
      const {first_name, last_name, email, initials, username} = user;

      if (initials) {
        setFinalUsername(initials);
      } else if (username) {
        setFinalUsername(username);
      } else if (first_name && last_name) {
        setFinalUsername(`${first_name[0]}${last_name[0]}`);
      } else if (email) {
        setFinalUsername(email.substring(0, 2));
      }

      setFinalSrc(user.avatar || src || DEFAULT_AVATAR_IMAGE);
    } else {
      setFinalUsername(username);
      setFinalSrc(src || DEFAULT_AVATAR_IMAGE);
    }
  }, [user, username, src]);

  const onImageLoaded = useCallback(() => {
    setImgVisible(true);
    setNameVisible(false);
  }, [finalSrc]);

  const userpic = (
    <Block ref={ref} name="userpic" mix={className} style={style} {...rest}>
      <Elem
        tag="img"
        name="avatar"
        ref={imgRef}
        src={finalSrc}
        alt={(finalUsername ?? "").toUpperCase()}
        style={{opacity: imgVisible ? 1 : 0}}
        onLoad={onImageLoaded}
        onError={() => setFinalSrc(DEFAULT_AVATAR_IMAGE) }
      />
      {nameVisible && (
        <Elem tag="span" name="username">
          {(finalUsername ?? "").toUpperCase()}
        </Elem>
      )}
    </Block>
  );

  const userFullName = useMemo(() => {
    if (user?.first_name || user?.last_name) {
      return `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();
    } else if (user?.email) {
      return user.email;
    } else {
      return username;
    }
  }, [user, username]);

  return (showUsername && userFullName) ? (
    <Tooltip title={userFullName}>
      {userpic}
    </Tooltip>
  ) : userpic;
});
Userpic.displayName = 'Userpic';
