let _transient = false;
export const setTransientSignIn = (v) => { _transient = !!v; };
export const getTransientSignIn = () => _transient;